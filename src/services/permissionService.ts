import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import {
  COLLECTIONS,
  permissionId,
  type ErrorCallback,
  type PermissionDoc,
  type PermissionStatus,
  type SessionDoc,
  type Unsubscribe,
} from '@/types/firebase';

import {
  analyzeSentiment,
  classifyPermissionReason,
  type AiClassification,
  type SentimentAnalysisResult,
  type SentimentLabel,
} from './aiService';
import { firestore, requireUid, toError, withId } from './firebase';

export interface PermissionAiRawMeta {
  status?: SentimentAnalysisResult['status'];
  provider?: 'local-edom';
  experimental?: boolean;
  analyzedAt?: string;
}

export interface PermissionDocWithMeta extends PermissionDoc {
  aiRaw?: PermissionAiRawMeta | null;
}

export interface SubmitPermissionInput {
  sessionId: string;
  classId?: string;
  alasan: string;
}

export interface SubmitPermissionOutput {
  id: string;
  aiResult: SentimentAnalysisResult;
  aiClassification: AiClassification;
}

const permissionsCol = () => collection(firestore(), COLLECTIONS.permissions);
const permissionRef = (id: string) => doc(firestore(), COLLECTIONS.permissions, id);
const sessionRef = (sessionId: string) => doc(firestore(), COLLECTIONS.sessions, sessionId);

function toPermission(snap: { id: string; data(): unknown }): PermissionDocWithMeta {
  return { ...(snap.data() as Omit<PermissionDocWithMeta, 'id'>), id: snap.id };
}

function sortByCreatedDesc(items: PermissionDocWithMeta[]): PermissionDocWithMeta[] {
  return [...items].sort(
    (a, b) =>
      (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()),
  );
}

/**
 * Mengonversi data PermissionDoc dari Firestore menjadi objek SentimentAnalysisResult
 * agar dapat langsung dirender oleh komponen <SentimentResultCard />.
 */
export function toSentimentResultFromDoc(
  perm: PermissionDocWithMeta | null | undefined,
): SentimentAnalysisResult | null {
  if (!perm) return null;
  if (perm.aiStatus === 'PENDING' && !perm.aiLabel && !perm.aiRaw) {
    return null;
  }

  const allowedLabels: SentimentLabel[] = ['positif', 'netral', 'negatif'];
  const label =
    perm.aiLabel && allowedLabels.includes(perm.aiLabel as SentimentLabel)
      ? (perm.aiLabel as SentimentLabel)
      : null;

  const rawStatus = perm.aiRaw?.status;
  const status: SentimentAnalysisResult['status'] =
    rawStatus ??
    (label
      ? 'predicted'
      : perm.aiStatus === 'FAILED'
        ? 'unknown_vocabulary'
        : 'failed');

  return {
    label,
    status,
    provider: 'local-edom',
    experimental: true,
    analyzedAt:
      perm.aiRaw?.analyzedAt ??
      (perm.updatedAt ? new Date(perm.updatedAt.toMillis()).toISOString() : new Date().toISOString()),
    confidence: perm.aiConfidence,
  };
}

/**
 * Menyimpan pengajuan izin praktikan untuk sesi tertentu (`permissions/{sessionId}_{uid}`).
 * Alur tahan kegagalan sesuai panduan Sprint 2 & instruksi PM:
 * 1. Validasi alasan tidak kosong (maksimal 1000 karakter).
 * 2. Pastikan belum ada pengajuan izin pada sesi yang sama.
 * 3. Simpan dokumen lebih dahulu dengan `status: 'PENDING'` dan `aiStatus: 'PENDING'`.
 * 4. Analisis sentimen alasan terbaru secara lokal, lalu update `aiStatus`, `aiLabel`, `aiConfidence`, dan `aiRaw`.
 * 5. Jika analisis gagal, pengajuan tetap tersimpan dengan `aiStatus: 'FAILED'`.
 */
export async function submitPermission(
  input: SubmitPermissionInput,
): Promise<SubmitPermissionOutput> {
  const uid = requireUid();
  const cleanSessionId = input.sessionId.trim();
  const cleanedReason = input.alasan.trim();

  if (!cleanSessionId) {
    throw new Error('ID sesi tidak valid.');
  }
  if (!cleanedReason) {
    throw new Error('Alasan izin harus diisi.');
  }
  if (cleanedReason.length < 3) {
    throw new Error('Alasan izin terlalu singkat (minimal 3 karakter).');
  }
  if (cleanedReason.length > 1000) {
    throw new Error('Alasan izin maksimal 1000 karakter.');
  }

  // Cek apakah sudah pernah mengajukan izin di sesi ini
  const existingSnap = await getDocs(
    query(
      permissionsCol(),
      where('praktikanUid', '==', uid),
      where('sessionId', '==', cleanSessionId),
    ),
  );
  if (!existingSnap.empty) {
    throw new Error('Anda sudah mengajukan izin untuk sesi ini.');
  }

  let resolvedClassId = input.classId?.trim() ?? '';
  if (!resolvedClassId) {
    const sessSnap = await getDoc(sessionRef(cleanSessionId));
    if (!sessSnap.exists()) {
      throw new Error('Sesi praktikum tidak ditemukan.');
    }
    const sessData = sessSnap.data() as Omit<SessionDoc, 'id'>;
    resolvedClassId = sessData.classId;
  }

  const id = permissionId(cleanSessionId, uid);
  const ref = permissionRef(id);

  // Tahap 1: Simpan dokumen izin dengan status PENDING & aiStatus PENDING (sesuai firestore.rules baris 218-236)
  await setDoc(ref, {
    sessionId: cleanSessionId,
    classId: resolvedClassId,
    praktikanUid: uid,
    alasan: cleanedReason,
    aiStatus: 'PENDING',
    aiLabel: null,
    aiConfidence: null,
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Tahap 2: Analisis sentimen lokal terbaru & update field AI (sesuai firestore.rules baris 249-256)
  let aiClassification: AiClassification;
  try {
    aiClassification = await classifyPermissionReason(cleanedReason);
    await updateDoc(ref, {
      aiStatus: aiClassification.status,
      aiLabel: aiClassification.label,
      aiConfidence: aiClassification.confidence,
      aiRaw: {
        status: aiClassification.raw.status,
        provider: aiClassification.raw.provider,
        experimental: aiClassification.raw.experimental,
        analyzedAt: aiClassification.raw.analyzedAt,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (aiErr) {
    console.error('AI update failed after saving permission:', aiErr);
    const fallbackRaw = await analyzeSentiment('');
    aiClassification = {
      label: null,
      confidence: null,
      status: 'FAILED',
      raw: { ...fallbackRaw, status: 'failed' },
    };
    await updateDoc(ref, {
      aiStatus: 'FAILED',
      aiLabel: null,
      aiConfidence: null,
      aiRaw: {
        status: 'failed',
        provider: 'local-edom',
        experimental: true,
        analyzedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  }

  return {
    id,
    aiResult: aiClassification.raw,
    aiClassification,
  };
}

/**
 * Mengulang analisis sentimen AI pada dokumen izin yang sudah ada tanpa membuat dokumen baru.
 */
export async function retryPermissionAi(
  idOrSessionId: string,
  alasan: string,
): Promise<SentimentAnalysisResult> {
  const uid = requireUid();
  const docId = idOrSessionId.includes('_')
    ? idOrSessionId
    : permissionId(idOrSessionId, uid);
  const ref = permissionRef(docId);

  const classification = await classifyPermissionReason(alasan);
  await updateDoc(ref, {
    aiStatus: classification.status,
    aiLabel: classification.label,
    aiConfidence: classification.confidence,
    aiRaw: {
      status: classification.raw.status,
      provider: classification.raw.provider,
      experimental: classification.raw.experimental,
      analyzedAt: classification.raw.analyzedAt,
    },
    updatedAt: serverTimestamp(),
  });

  return classification.raw;
}

/**
 * Keputusan manual oleh asisten (APPROVED / REJECTED).
 * Sesuai firestore.rules baris 238-247, hanya menyentuh ['status', 'reviewedBy', 'reviewedAt', 'updatedAt'].
 */
export async function reviewPermission(
  id: string,
  decision: Extract<PermissionStatus, 'APPROVED' | 'REJECTED'>,
): Promise<void> {
  const asistenUid = requireUid();
  await updateDoc(permissionRef(id), {
    status: decision,
    reviewedBy: asistenUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Listener real-time daftar izin milik seorang praktikan (kontrak wajib Sprint 2 Bagian 3).
 */
export function subscribePermissionsForUser(
  uid: string,
  callback: (permissions: PermissionDocWithMeta[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const activeUid = uid || requireUid();
  return onSnapshot(
    query(permissionsCol(), where('praktikanUid', '==', activeUid)),
    (snap) => callback(sortByCreatedDesc(snap.docs.map(toPermission))),
    (error) => onError(toError(error)),
  );
}

/**
 * Listener real-time pengajuan izin praktikan untuk satu sesi tertentu.
 */
export function subscribeMySessionPermission(
  sessionId: string,
  uid: string | null | undefined,
  callback: (permission: PermissionDocWithMeta | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const activeUid = uid || requireUid();
  return onSnapshot(
    query(
      permissionsCol(),
      where('praktikanUid', '==', activeUid),
      where('sessionId', '==', sessionId),
    ),
    (snap) => {
      const first = snap.docs[0];
      callback(first ? toPermission(first) : null);
    },
    (error) => onError(toError(error)),
  );
}

/**
 * Listener real-time seluruh pengajuan izin untuk diperiksa oleh Asisten.
 */
export function subscribeAllPermissions(
  callback: (permissions: PermissionDocWithMeta[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    permissionsCol(),
    (snap) => callback(sortByCreatedDesc(snap.docs.map(toPermission))),
    (error) => onError(toError(error)),
  );
}

/**
 * Listener real-time satu dokumen izin berdasarkan ID (untuk layar detail pemeriksaan Asisten).
 */
export function subscribePermissionById(
  id: string,
  callback: (permission: PermissionDocWithMeta | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    permissionRef(id),
    (snap) => callback(withId<PermissionDocWithMeta>(snap)),
    (error) => onError(toError(error)),
  );
}

