import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import {
  COLLECTIONS,
  type AttendanceDoc,
  type ErrorCallback,
  type SessionDoc,
  type SessionStatus,
  type Unsubscribe,
  type UserDoc,
} from '@/types/firebase';

import {
  commitBatchDeletes,
  firestore,
  requireUid,
  subscribePerClassQuery,
  toError,
  userRef,
  withId,
} from './firebase';
import { notifySessionOpened, notifySessionRescheduled } from './notificationService';

export interface SessionInput {
  classId: string;
  judul: string;
  ruangan: string;
  labId?: string | null;
  startsAt: Date;
  endsAt: Date;
  catatan?: string;
}

const sessionsCol = () => collection(firestore(), COLLECTIONS.sessions);
const sessionRef = (sessionId: string) => doc(firestore(), COLLECTIONS.sessions, sessionId);

function toSession(snap: { id: string; data(): unknown }): SessionDoc {
  return { ...(snap.data() as Omit<SessionDoc, 'id'>), id: snap.id };
}

function sortByStart(sessions: SessionDoc[]): SessionDoc[] {
  return [...sessions].sort((a, b) => (a.startsAt?.toMillis() ?? 0) - (b.startsAt?.toMillis() ?? 0));
}

// -------------------------------------------------------------- Listener

/**
 * Jadwal untuk pengguna yang login (signature kontrak tidak berubah).
 * - Asisten: sesi pada kelas tempat ia terdaftar pada `assistantIds`.
 * - Praktikan: sesi pada kelas tempat ia menjadi anggota (`classMembers`).
 * Listener dipecah per classId agar sesuai Security Rules yang membatasi akses per kelas.
 */
export function subscribeSessions(
  callback: (sessions: SessionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  let cancelled = false;
  let stopFanOut: Unsubscribe | null = null;

  const start = async () => {
    try {
      const uid = requireUid();
      const profileSnap = await getDoc(userRef(uid));
      if (cancelled) return;
      const profile = withId<UserDoc>(profileSnap);
      if (!profile) throw new Error('Profil pengguna tidak ditemukan.');

      const rootQuery =
        profile.role === 'asisten'
          ? query(collection(firestore(), COLLECTIONS.classes), where('assistantIds', 'array-contains', uid))
          : query(collection(firestore(), COLLECTIONS.classMembers), where('uid', '==', uid));

      stopFanOut = subscribePerClassQuery<SessionDoc>({
        rootQuery,
        extractClassId: (d) => (profile.role === 'asisten' ? d.id : (d.data().classId as string)),
        buildClassQuery: (classId) => query(sessionsCol(), where('classId', '==', classId)),
        mapDoc: toSession,
        sortItems: sortByStart,
        callback,
        onError,
      });
    } catch (error) {
      if (!cancelled) onError(toError(error));
    }
  };

  void start();

  return () => {
    cancelled = true;
    stopFanOut?.();
    stopFanOut = null;
  };
}

/** Satu sesi; callback(null) bila dokumen tidak ada. */
export function subscribeSession(
  sessionId: string,
  callback: (session: SessionDoc | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => callback(withId<SessionDoc>(snap)),
    (error) => onError(toError(error)),
  );
}

/**
 * Rekap kehadiran satu sesi secara real-time untuk asisten kelas terkait.
 * Menyertakan filter `classId` agar lolos validasi statis Security Rules `isClassAsisten(classId)`.
 */
export function subscribeAttendances(
  sessionId: string,
  callback: (attendances: AttendanceDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;

  const start = async () => {
    try {
      const snap = await getDoc(sessionRef(sessionId));
      if (cancelled) return;
      const sess = withId<SessionDoc>(snap);
      if (!sess) {
        callback([]);
        return;
      }
      unsub = onSnapshot(
        query(
          collection(firestore(), COLLECTIONS.attendances),
          where('sessionId', '==', sessionId),
          where('classId', '==', sess.classId),
        ),
        (attSnap) =>
          callback(
            attSnap.docs
              .map((d) => ({ ...(d.data() as Omit<AttendanceDoc, 'id'>), id: d.id }))
              .sort((a, b) => (a.attendedAt?.toMillis() ?? Infinity) - (b.attendedAt?.toMillis() ?? Infinity)),
          ),
        (error) => onError(toError(error)),
      );
    } catch (error) {
      if (!cancelled) onError(toError(error));
    }
  };

  void start();

  return () => {
    cancelled = true;
    unsub?.();
    unsub = null;
  };
}

// ------------------------------------------------------------------ CRUD

export async function createSession(input: SessionInput): Promise<string> {
  const uid = requireUid();
  const ref = await addDoc(sessionsCol(), {
    classId: input.classId,
    judul: input.judul.trim(),
    ruangan: input.ruangan.trim(),
    labId: input.labId?.trim() || null,
    startsAt: Timestamp.fromDate(input.startsAt),
    endsAt: Timestamp.fromDate(input.endsAt),
    status: 'BELUM_DIBUKA',
    catatan: (input.catatan ?? '').trim(),
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Mengubah data sesi (bukan status). Status hanya berubah lewat openSession/closeSession. */
export async function updateSession(
  sessionId: string,
  input: Omit<SessionInput, 'classId'>,
): Promise<void> {
  const ref = sessionRef(sessionId);
  let prev: SessionDoc | null = null;
  try {
    prev = withId<SessionDoc>(await getDoc(ref));
  } catch {
    // Tetap lanjutkan update meskipun pra-baca gagal; notifikasi dilewati.
  }

  const cleanJudul = input.judul.trim();
  const cleanRuangan = input.ruangan.trim();
  const nextStartsAt = Timestamp.fromDate(input.startsAt);
  const nextEndsAt = Timestamp.fromDate(input.endsAt);
  const cleanCatatan = (input.catatan ?? '').trim();

  await updateDoc(ref, {
    judul: cleanJudul,
    ruangan: cleanRuangan,
    ...(input.labId === undefined ? {} : { labId: input.labId?.trim() || null }),
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    catatan: cleanCatatan,
    updatedAt: serverTimestamp(),
  });

  if (prev && prev.status !== 'DITUTUP') {
    const changes: string[] = [];
    if (
      prev.startsAt?.toMillis() !== input.startsAt.getTime() ||
      prev.endsAt?.toMillis() !== input.endsAt.getTime()
    ) {
      changes.push('waktu');
    }

    const prevLabId = prev.labId ?? null;
    const resolvedLabId = input.labId === undefined ? prevLabId : (input.labId?.trim() || null);
    if (prev.ruangan !== cleanRuangan || prevLabId !== resolvedLabId) {
      changes.push('ruangan');
    }

    if (changes.length > 0) {
      void notifySessionRescheduled(
        {
          ...prev,
          judul: cleanJudul,
          ruangan: cleanRuangan,
          labId: resolvedLabId,
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
          catatan: cleanCatatan,
        },
        changes,
      );
    }
  }
}

/**
 * Menghapus sesi beserta seluruh presensi dan pengajuan izin terkait agar tidak meninggalkan data yatim.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  const sess = withId<SessionDoc>(snap);
  if (!sess) return;

  const db = firestore();
  const [attendances, permissions] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTIONS.attendances),
        where('sessionId', '==', sessionId),
        where('classId', '==', sess.classId),
      ),
    ),
    getDocs(
      query(
        collection(db, COLLECTIONS.permissions),
        where('sessionId', '==', sessionId),
        where('classId', '==', sess.classId),
      ),
    ),
  ]);

  const refs = [...attendances.docs, ...permissions.docs].map((d) => d.ref);
  refs.push(ref);
  await commitBatchDeletes(refs);
}

// ------------------------------------------------------- Siklus hidup sesi

const NEXT_STATUS: Record<SessionStatus, SessionStatus | null> = {
  BELUM_DIBUKA: 'DIBUKA',
  DIBUKA: 'DITUTUP',
  DITUTUP: null,
};

async function transition(
  sessionId: string,
  from: SessionStatus,
  catatan?: string,
): Promise<SessionDoc> {
  const to = NEXT_STATUS[from];
  if (!to) throw new Error('Sesi yang sudah ditutup tidak dapat diubah statusnya.');

  return runTransaction(firestore(), async (tx) => {
    const ref = sessionRef(sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Sesi tidak ditemukan.');
    const prevData = snap.data() as Omit<SessionDoc, 'id'>;
    if (prevData.status !== from) {
      throw new Error('Status sesi sudah berubah. Muat ulang lalu coba lagi.');
    }
    const nextCatatan = catatan === undefined ? prevData.catatan : catatan.trim();
    tx.update(ref, {
      status: to,
      ...(catatan === undefined ? {} : { catatan: nextCatatan }),
      updatedAt: serverTimestamp(),
    });
    return {
      ...prevData,
      id: snap.id,
      status: to,
      catatan: nextCatatan,
    };
  });
}

/** BELUM_DIBUKA -> DIBUKA, lalu mengirim notifikasi push ke praktikan kelas terkait. */
export async function openSession(sessionId: string, catatan?: string): Promise<void> {
  const updatedSession = await transition(sessionId, 'BELUM_DIBUKA', catatan);
  void notifySessionOpened(updatedSession);
}

/** DIBUKA -> DITUTUP. */
export async function closeSession(sessionId: string, catatan?: string): Promise<void> {
  await transition(sessionId, 'DIBUKA', catatan);
}
