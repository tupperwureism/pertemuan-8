import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
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

import { firestore, requireUid, toError, userRef, withId } from './firebase';

export interface SessionInput {
  classId: string;
  judul: string;
  ruangan: string;
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
 * - Asisten: seluruh sesi.
 * - Praktikan: hanya sesi pada kelas tempat ia menjadi anggota. Security Rules bukan filter,
 *   jadi service menurunkan daftar classId dari classMembers milik UID login lalu membuat satu
 *   listener per kelas (equality query, aman untuk rules). Semua listener dibersihkan oleh
 *   fungsi unsubscribe yang dikembalikan.
 */
export function subscribeSessions(
  callback: (sessions: SessionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  let cancelled = false;
  let stopRoot: Unsubscribe | null = null;
  const perClass = new Map<string, Unsubscribe>();
  const results = new Map<string, SessionDoc[]>();

  const emit = () => {
    if (!cancelled) callback(sortByStart([...results.values()].flat()));
  };

  const clearClassListeners = () => {
    perClass.forEach((unsub) => unsub());
    perClass.clear();
    results.clear();
  };

  const start = async () => {
    try {
      const uid = requireUid();
      const profileSnap = await getDoc(userRef(uid));
      if (cancelled) return;
      const profile = withId<UserDoc>(profileSnap);
      if (!profile) throw new Error('Profil pengguna tidak ditemukan.');

      if (profile.role === 'asisten') {
        stopRoot = onSnapshot(
          query(sessionsCol(), orderBy('startsAt', 'asc')),
          (snap) => {
            if (!cancelled) callback(snap.docs.map(toSession));
          },
          (error) => onError(toError(error)),
        );
        return;
      }

      stopRoot = onSnapshot(
        query(collection(firestore(), COLLECTIONS.classMembers), where('uid', '==', uid)),
        (membersSnap) => {
          if (cancelled) return;
          const classIds = new Set(membersSnap.docs.map((d) => d.data().classId as string));

          // Hentikan listener kelas yang sudah tidak diikuti.
          for (const [classId, unsub] of perClass) {
            if (!classIds.has(classId)) {
              unsub();
              perClass.delete(classId);
              results.delete(classId);
            }
          }
          // Mulai listener untuk kelas baru.
          classIds.forEach((classId) => {
            if (perClass.has(classId)) return;
            results.set(classId, []);
            perClass.set(
              classId,
              onSnapshot(
                query(sessionsCol(), where('classId', '==', classId)),
                (snap) => {
                  results.set(classId, snap.docs.map(toSession));
                  emit();
                },
                (error) => onError(toError(error)),
              ),
            );
          });
          emit();
        },
        (error) => onError(toError(error)),
      );
    } catch (error) {
      if (!cancelled) onError(toError(error));
    }
  };

  void start();

  return () => {
    cancelled = true;
    stopRoot?.();
    stopRoot = null;
    clearClassListeners();
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
 * Rekap kehadiran satu sesi secara real-time. Khusus asisten (rules: praktikan hanya
 * boleh membaca dokumen miliknya, jadi query tanpa filter praktikanUid ditolak).
 * attendanceService milik Programmer 2 tidak perlu menduplikasi fungsi ini.
 */
export function subscribeAttendances(
  sessionId: string,
  callback: (attendances: AttendanceDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    query(collection(firestore(), COLLECTIONS.attendances), where('sessionId', '==', sessionId)),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<AttendanceDoc, 'id'>), id: d.id }))
          .sort((a, b) => (a.attendedAt?.toMillis() ?? Infinity) - (b.attendedAt?.toMillis() ?? Infinity)),
      ),
    (error) => onError(toError(error)),
  );
}

// ------------------------------------------------------------------ CRUD

export async function createSession(input: SessionInput): Promise<string> {
  const uid = requireUid();
  const ref = await addDoc(sessionsCol(), {
    classId: input.classId,
    judul: input.judul.trim(),
    ruangan: input.ruangan.trim(),
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
  await updateDoc(sessionRef(sessionId), {
    judul: input.judul.trim(),
    ruangan: input.ruangan.trim(),
    startsAt: Timestamp.fromDate(input.startsAt),
    endsAt: Timestamp.fromDate(input.endsAt),
    catatan: (input.catatan ?? '').trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteDoc(sessionRef(sessionId));
}

// ------------------------------------------------------- Siklus hidup sesi

const NEXT_STATUS: Record<SessionStatus, SessionStatus | null> = {
  BELUM_DIBUKA: 'DIBUKA',
  DIBUKA: 'DITUTUP',
  DITUTUP: null,
};

async function transition(sessionId: string, from: SessionStatus, catatan?: string): Promise<void> {
  const to = NEXT_STATUS[from];
  if (!to) throw new Error('Sesi yang sudah ditutup tidak dapat diubah statusnya.');

  await runTransaction(firestore(), async (tx) => {
    const ref = sessionRef(sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Sesi tidak ditemukan.');
    const current = snap.data()?.status as SessionStatus;
    if (current !== from) {
      throw new Error('Status sesi sudah berubah. Muat ulang lalu coba lagi.');
    }
    tx.update(ref, {
      status: to,
      ...(catatan === undefined ? {} : { catatan: catatan.trim() }),
      updatedAt: serverTimestamp(),
    });
  });
}

/** BELUM_DIBUKA -> DIBUKA. */
export const openSession = (sessionId: string, catatan?: string) =>
  transition(sessionId, 'BELUM_DIBUKA', catatan);

/** DIBUKA -> DITUTUP. */
export const closeSession = (sessionId: string, catatan?: string) =>
  transition(sessionId, 'DIBUKA', catatan);
