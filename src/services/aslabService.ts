import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';

import { cosLatitude } from '@/lib/geo';
import {
  classMemberId,
  COLLECTIONS,
  labMemberId,
  type ErrorCallback,
  type FineDoc,
  type LabDoc,
  type LabMemberDoc,
  type PaymentTransactionDoc,
  type SessionDoc,
  type Unsubscribe,
  type UserDoc,
  type UserRole,
} from '@/types/firebase';

import { commitBatchDeletes, firestore, requireUid, toError, userRef, withId } from './firebase';
import { toUserDoc } from './userService';

export type DashboardPeriod = 'DAY' | 'WEEK' | 'MONTH';

export interface LabPolicyInput {
  nama: string;
  gedung: string;
  deskripsi?: string;
  mataKuliah: string;
  latitude: number;
  longitude: number;
  radiusMeter: number;
  gracePeriodMinutes: number;
  fineAmount: number;
}

export interface BulkAssignRow {
  email?: string;
  nomorInduk?: string;
  nama?: string;
}

export interface BulkOperationSummary {
  succeeded: number;
  failed: { label: string; reason: string }[];
}

const labsCol = () => collection(firestore(), COLLECTIONS.labs);
const labMembersCol = () => collection(firestore(), COLLECTIONS.labMembers);
const classesCol = () => collection(firestore(), COLLECTIONS.classes);
const usersCol = () => collection(firestore(), COLLECTIONS.users);
const sessionsCol = () => collection(firestore(), COLLECTIONS.sessions);
const finesCol = () => collection(firestore(), COLLECTIONS.fines);
const paymentTxCol = () => collection(firestore(), COLLECTIONS.paymentTransactions);

const labDocRef = (labId: string) => doc(firestore(), COLLECTIONS.labs, labId);
const labMemberDocRef = (labId: string, uid: string) =>
  doc(firestore(), COLLECTIONS.labMembers, labMemberId(labId, uid));
const classDocRef = (classId: string) => doc(firestore(), COLLECTIONS.classes, classId);
const classMemberDocRef = (classId: string, uid: string) =>
  doc(firestore(), COLLECTIONS.classMembers, classMemberId(classId, uid));

const rupiahFmt = new Intl.NumberFormat('id-ID');

export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  return `Rp ${rupiahFmt.format(safe)}`;
}

/**
 * Filter periode dashboard Aslab ('DAY' | 'WEEK' | 'MONTH').
 * Hari: tanggal kalender sama; Minggu: rentang +-6 hari (minggu berjalan + 7 hari terakhir/mendatang);
 * Bulan: bulan & tahun kalender sama.
 */
export function isInPeriod(
  date: Date | null | undefined,
  period: DashboardPeriod,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  if (period === 'DAY') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }
  if (period === 'MONTH') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.abs(startOfDay(date) - startOfDay(now)) / 86_400_000;
  return diffDays <= 6;
}

function makeKodeKelas(namaLab: string): string {
  const clean = namaLab
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  const prefix = (clean || 'LAB').slice(0, 20);
  return `${prefix}-${suffix}`.slice(0, 30);
}

function validateLabPolicy(input: LabPolicyInput) {
  const nama = input.nama.trim();
  const gedung = input.gedung.trim();
  const deskripsi = (input.deskripsi ?? '').trim();
  const mataKuliah = input.mataKuliah.trim();
  const { latitude, longitude, radiusMeter, gracePeriodMinutes, fineAmount } = input;

  if (!nama || nama.length > 100) {
    throw new Error('Nama laboratorium wajib diisi (maksimal 100 karakter).');
  }
  if (!gedung || gedung.length > 100) {
    throw new Error('Nama gedung wajib diisi (maksimal 100 karakter).');
  }
  if (!mataKuliah || mataKuliah.length > 100) {
    throw new Error('Mata kuliah wajib diisi (maksimal 100 karakter).');
  }
  if (deskripsi.length > 500) {
    throw new Error('Deskripsi laboratorium maksimal 500 karakter.');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude harus antara -90 sampai 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude harus antara -180 sampai 180.');
  }
  if (!Number.isFinite(radiusMeter) || radiusMeter < 10 || radiusMeter > 1000) {
    throw new Error('Cakupan lokasi presensi (radius) harus antara 10 sampai 1000 meter.');
  }
  if (!Number.isFinite(gracePeriodMinutes) || gracePeriodMinutes < 0 || gracePeriodMinutes > 180) {
    throw new Error('Batasan keterlambatan (grace period) harus antara 0 sampai 180 menit.');
  }
  if (!Number.isFinite(fineAmount) || fineAmount < 0 || fineAmount > 500_000) {
    throw new Error('Nominal denda harus antara Rp 0 sampai Rp 500.000.');
  }

  const cosLat = cosLatitude(latitude);
  if (!Number.isFinite(cosLat) || cosLat <= 0 || cosLat > 1) {
    throw new Error('Koordinat latitude tidak valid.');
  }

  return {
    nama,
    gedung,
    deskripsi,
    mataKuliah,
    latitude,
    longitude,
    radiusMeter: Math.round(radiusMeter),
    gracePeriodMinutes: Math.round(gracePeriodMinutes),
    fineAmount: Math.round(fineAmount),
    cosLat,
  };
}

async function ensureCompanionClass(
  lab: { nama: string; mataKuliah: string; classId?: string | null; asprakIds?: string[] },
  fallbackUid: string,
): Promise<string> {
  const existingId = lab.classId?.trim();
  if (existingId) {
    const snap = await getDoc(classDocRef(existingId));
    if (snap.exists()) return existingId;
  }

  const assistantIds = lab.asprakIds && lab.asprakIds.length > 0 ? lab.asprakIds : [fallbackUid];
  const ref = await addDoc(classesCol(), {
    nama: lab.nama.slice(0, 100),
    mataPraktikum: lab.mataKuliah.slice(0, 100),
    kodeKelas: makeKodeKelas(lab.nama),
    assistantIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function upsertLabMember(
  labId: string,
  user: UserDoc,
  assignedBy: string,
): Promise<void> {
  const targetUid = user.uid || user.id;
  const ref = labMemberDocRef(labId, targetUid);
  const existing = await getDoc(ref);
  const cleanEmail = (user.email ?? '').trim();
  const cleanNama = (user.nama ?? '').trim();
  const cleanNomorInduk = (user.nomorInduk ?? '').trim();
  const payload = {
    labId,
    uid: targetUid,
    role: user.role,
    nama: (cleanNama || cleanEmail || '-').slice(0, 100),
    nomorInduk: (cleanNomorInduk || '-').slice(0, 30),
    email: (cleanEmail || '-').slice(0, 320),
  };

  if (existing.exists()) {
    await updateDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      ...payload,
      assignedBy,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function ensureClassMember(classId: string, uid: string, role: UserRole): Promise<void> {
  const ref = classMemberDocRef(classId, uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      classId,
      uid,
      role,
      joinedAt: serverTimestamp(),
    });
  }
}

// ------------------------------------------------------------ Subscriptions

export function subscribeAllLabs(
  callback: (labs: LabDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    labsCol(),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<LabDoc, 'id'>), id: d.id }))
          .sort((a, b) => a.nama.localeCompare(b.nama)),
      ),
    (error) => onError(toError(error)),
  );
}

export function subscribeLabMembers(
  labId: string | null,
  callback: (members: LabMemberDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    labMembersCol(),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ ...(d.data() as Omit<LabMemberDoc, 'id'>), id: d.id }))
        .filter((m) => !labId || m.labId === labId)
        .sort((a, b) => a.nama.localeCompare(b.nama));
      callback(items);
    },
    (error) => onError(toError(error)),
  );
}

export function subscribeAllUsers(
  callback: (users: UserDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    usersCol(),
    (snap) =>
      callback(
        snap.docs
          .map((d) => toUserDoc(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => a.nama.localeCompare(b.nama)),
      ),
    (error) => onError(toError(error)),
  );
}

export function subscribeAllSessionsForAslab(
  callback: (sessions: SessionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    sessionsCol(),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<SessionDoc, 'id'>), id: d.id }))
          .sort((a, b) => (b.startsAt?.toMillis() ?? 0) - (a.startsAt?.toMillis() ?? 0)),
      ),
    (error) => onError(toError(error)),
  );
}

export function subscribeAllFinesForAslab(
  callback: (fines: FineDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    finesCol(),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<FineDoc, 'id'>), id: d.id }))
          .sort((a, b) => (b.issuedAt?.toMillis() ?? 0) - (a.issuedAt?.toMillis() ?? 0)),
      ),
    (error) => onError(toError(error)),
  );
}

export function subscribeAllPaymentTransactionsForAslab(
  callback: (txs: PaymentTransactionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    paymentTxCol(),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<PaymentTransactionDoc, 'id'>), id: d.id }))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
      ),
    (error) => onError(toError(error)),
  );
}

// ------------------------------------------------------------ Lab CRUD & Bulk

export async function createLabWithPolicy(input: LabPolicyInput): Promise<string> {
  const uid = requireUid();
  const payload = validateLabPolicy(input);
  const classId = await ensureCompanionClass(
    { nama: payload.nama, mataKuliah: payload.mataKuliah },
    uid,
  );

  const ref = await addDoc(labsCol(), {
    ...payload,
    classId,
    asprakIds: [],
    aslabIds: [uid],
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const creatorSnap = await getDoc(userRef(uid)).catch(() => null);
  if (creatorSnap?.exists()) {
    await upsertLabMember(
      ref.id,
      toUserDoc(creatorSnap.id, creatorSnap.data() as Record<string, unknown>),
      uid,
    ).catch(() => undefined);
  }
  return ref.id;
}

export async function updateLabWithPolicy(labId: string, input: LabPolicyInput): Promise<void> {
  const uid = requireUid();
  const cleanId = labId.trim();
  if (!cleanId) throw new Error('ID laboratorium tidak valid.');

  const payload = validateLabPolicy(input);
  const snap = await getDoc(labDocRef(cleanId));
  const existing = withId<LabDoc>(snap);
  if (!existing) throw new Error('Laboratorium tidak ditemukan.');

  const classId = await ensureCompanionClass(
    {
      nama: payload.nama,
      mataKuliah: payload.mataKuliah,
      classId: existing.classId,
      asprakIds: existing.asprakIds,
    },
    uid,
  );

  await updateDoc(labDocRef(cleanId), {
    ...payload,
    classId,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(classDocRef(classId), {
    nama: payload.nama.slice(0, 100),
    mataPraktikum: payload.mataKuliah.slice(0, 100),
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);
}

export async function deleteLabAslab(labId: string): Promise<void> {
  requireUid();
  const cleanId = labId.trim();
  if (!cleanId) throw new Error('ID laboratorium tidak valid.');

  const membersSnap = await getDocs(labMembersCol());
  const toDelete = membersSnap.docs
    .filter((d) => (d.data() as { labId?: string }).labId === cleanId)
    .map((d) => d.ref);
  await commitBatchDeletes(toDelete);
  await deleteDoc(labDocRef(cleanId));
}

export async function bulkCreateLabsForCourse(
  mataKuliah: string,
  rows: Omit<LabPolicyInput, 'mataKuliah'>[],
): Promise<BulkOperationSummary> {
  const cleanCourse = mataKuliah.trim();
  if (!cleanCourse) {
    throw new Error('Nama mata kuliah wajib diisi untuk bulk insert laboratorium.');
  }

  let succeeded = 0;
  const failed: BulkOperationSummary['failed'] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.nama.trim() || `Baris ${i + 1}`;
    try {
      await createLabWithPolicy({ ...row, mataKuliah: cleanCourse });
      succeeded++;
    } catch (error) {
      failed.push({
        label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { succeeded, failed };
}

// ------------------------------------------------------------ Distribusi & Pindah

export async function assignUsersToLab(
  labId: string,
  targetRole: 'praktikan' | 'asisten',
  rows: BulkAssignRow[],
): Promise<BulkOperationSummary> {
  const uid = requireUid();
  const labSnap = await getDoc(labDocRef(labId));
  const lab = withId<LabDoc>(labSnap);
  if (!lab) throw new Error('Laboratorium tujuan tidak ditemukan.');

  let classId = lab.classId?.trim() ?? '';
  if (!classId) {
    classId = await ensureCompanionClass(
      {
        nama: lab.nama,
        mataKuliah: lab.mataKuliah?.trim() || lab.nama,
        asprakIds: lab.asprakIds,
      },
      uid,
    );
    await updateDoc(labDocRef(lab.id), { classId, updatedAt: serverTimestamp() });
  }

  const usersSnap = await getDocs(usersCol());
  const byEmail = new Map<string, UserDoc>();
  const byNomorInduk = new Map<string, UserDoc>();
  usersSnap.docs.forEach((d) => {
    const u = toUserDoc(d.id, d.data() as Record<string, unknown>);
    if (u.email) byEmail.set(u.email.trim().toLowerCase(), u);
    if (u.nomorInduk) byNomorInduk.set(u.nomorInduk.trim().toLowerCase(), u);
  });

  let succeeded = 0;
  const failed: BulkOperationSummary['failed'] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const emailKey = (row.email ?? '').trim().toLowerCase();
    const idKey = (row.nomorInduk ?? '').trim().toLowerCase();
    const label = row.email?.trim() || row.nomorInduk?.trim() || row.nama?.trim() || `Baris ${i + 1}`;

    const matched = (emailKey ? byEmail.get(emailKey) : undefined) ?? (idKey ? byNomorInduk.get(idKey) : undefined);
    if (!matched) {
      failed.push({ label, reason: 'Akun belum terdaftar di sistem.' });
      continue;
    }
    if (matched.role !== targetRole) {
      const expectedLabel = targetRole === 'praktikan' ? 'Praktikan' : 'Asprak (Asisten)';
      failed.push({
        label,
        reason: `Peran akun adalah "${matched.role}", bukan ${expectedLabel}.`,
      });
      continue;
    }

    try {
      await upsertLabMember(lab.id, matched, uid);
      if (targetRole === 'praktikan') {
        await ensureClassMember(classId, matched.uid, 'praktikan');
      } else {
        await updateDoc(labDocRef(lab.id), {
          asprakIds: arrayUnion(matched.uid),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(classDocRef(classId), {
          assistantIds: arrayUnion(matched.uid),
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
      succeeded++;
    } catch (error) {
      failed.push({
        label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { succeeded, failed };
}

/**
 * Memindahkan praktikan / asprak / aslab antar lab tanpa menyentuh dokumen sessions (jadwal).
 */
export async function moveMemberBetweenLabs(input: {
  uid: string;
  fromLabId: string;
  toLabId: string;
}): Promise<void> {
  const actorUid = requireUid();
  const { uid, fromLabId, toLabId } = input;
  if (!uid || !fromLabId || !toLabId) {
    throw new Error('Lab asal, anggota, dan lab tujuan wajib dipilih.');
  }
  if (fromLabId === toLabId) {
    throw new Error('Lab tujuan harus berbeda dari lab asal.');
  }

  const [fromSnap, toSnap, userSnap, memberSnap] = await Promise.all([
    getDoc(labDocRef(fromLabId)),
    getDoc(labDocRef(toLabId)),
    getDoc(userRef(uid)),
    getDoc(labMemberDocRef(fromLabId, uid)),
  ]);

  const fromLab = withId<LabDoc>(fromSnap);
  const toLab = withId<LabDoc>(toSnap);
  const user = userSnap.exists()
    ? toUserDoc(userSnap.id, userSnap.data() as Record<string, unknown>)
    : null;
  const fromMember = withId<LabMemberDoc>(memberSnap);

  if (!fromLab || !toLab) throw new Error('Laboratorium asal atau tujuan tidak ditemukan.');
  if (!user) throw new Error('Profil anggota tidak ditemukan.');

  const memberRole: UserRole = fromMember?.role ?? user.role;

  let toClassId = toLab.classId?.trim() ?? '';
  if (!toClassId) {
    toClassId = await ensureCompanionClass(
      {
        nama: toLab.nama,
        mataKuliah: toLab.mataKuliah?.trim() || toLab.nama,
        asprakIds: toLab.asprakIds,
      },
      actorUid,
    );
    await updateDoc(labDocRef(toLab.id), { classId: toClassId, updatedAt: serverTimestamp() });
  }

  // 1. Hapus keanggotaan dari lab asal
  if (fromMember) {
    await deleteDoc(labMemberDocRef(fromLab.id, uid));
  }
  if (memberRole === 'praktikan' && fromLab.classId) {
    await deleteDoc(classMemberDocRef(fromLab.classId, uid)).catch(() => undefined);
  } else if (memberRole === 'asisten') {
    await updateDoc(labDocRef(fromLab.id), {
      asprakIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
    if (fromLab.classId) {
      const fromClassSnap = await getDoc(classDocRef(fromLab.classId));
      if (fromClassSnap.exists()) {
        const currentAssistants =
          ((fromClassSnap.data() as { assistantIds?: string[] }).assistantIds ?? []).filter(
            (id) => id !== uid,
          );
        // Security rules mewajibkan assistantIds.size() >= 1.
        const nextAssistants =
          currentAssistants.length > 0 ? currentAssistants : [fromLab.createdBy || actorUid];
        await updateDoc(classDocRef(fromLab.classId), {
          assistantIds: nextAssistants,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } else if (memberRole === 'aslab') {
    await updateDoc(labDocRef(fromLab.id), {
      aslabIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
  }

  // 2. Tambahkan ke lab tujuan (tanpa mengubah dokumen `sessions`)
  await upsertLabMember(toLab.id, { ...user, role: memberRole }, actorUid);
  if (memberRole === 'praktikan') {
    await ensureClassMember(toClassId, uid, 'praktikan');
  } else if (memberRole === 'asisten') {
    await updateDoc(labDocRef(toLab.id), {
      asprakIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(classDocRef(toClassId), {
      assistantIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  } else if (memberRole === 'aslab') {
    await updateDoc(labDocRef(toLab.id), {
      aslabIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  }
}
