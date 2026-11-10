import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@react-native-firebase/firestore';

import {
  attendanceId,
  COLLECTIONS,
  type AttendanceDoc,
  type ClassDoc,
  type ErrorCallback,
  type SessionDoc,
  type Unsubscribe,
} from '@/types/firebase';

import { firestore, requireUid, toError, withId } from './firebase';
import { subscribeAttendances } from './sessionService';

export { subscribeAttendances };

const attendancesCol = () => collection(firestore(), COLLECTIONS.attendances);
const attendanceRef = (id: string) => doc(firestore(), COLLECTIONS.attendances, id);
const sessionRef = (sessionId: string) => doc(firestore(), COLLECTIONS.sessions, sessionId);
const classRef = (classId: string) => doc(firestore(), COLLECTIONS.classes, classId);

function toAttendance(snap: { id: string; data(): unknown }): AttendanceDoc {
  return { ...(snap.data() as Omit<AttendanceDoc, 'id'>), id: snap.id };
}

function sortByAttendedDesc(items: AttendanceDoc[]): AttendanceDoc[] {
  return [...items].sort(
    (a, b) =>
      (b.attendedAt?.toMillis() ?? Date.now()) - (a.attendedAt?.toMillis() ?? Date.now()),
  );
}

/**
 * Mencatat kehadiran praktikan satu kali ketika sesi berstatus DIBUKA.
 * Memakai UID dari Firebase Auth (requireUid), ID deterministik `{sessionId}_{uid}`,
 * serverTimestamp(), dan transaksi Firestore anti-dobel.
 */
export async function recordAttendance(
  sessionId: string,
  uid?: string,
  note?: string,
): Promise<void> {
  const authUid = requireUid();
  if (uid && uid !== authUid) {
    throw new Error('Identitas pengguna tidak sesuai dengan sesi login aktif.');
  }

  const cleanSessionId = sessionId.trim();
  if (!cleanSessionId) {
    throw new Error('ID sesi tidak valid.');
  }

  const trimmedNote = note?.trim() ?? '';
  if (trimmedNote.length > 500) {
    throw new Error('Catatan kehadiran maksimal 500 karakter.');
  }

  // Cek awal via equality query (aman terhadap rule resource.data.praktikanUid == request.auth.uid).
  const existingSnap = await getDocs(
    query(
      attendancesCol(),
      where('praktikanUid', '==', authUid),
      where('sessionId', '==', cleanSessionId),
    ),
  );
  if (!existingSnap.empty) {
    throw new Error('Presensi Anda sudah tercatat pada sesi ini.');
  }

  const targetId = attendanceId(cleanSessionId, authUid);
  const targetRef = attendanceRef(targetId);

  await runTransaction(firestore(), async (tx) => {
    const sessSnap = await tx.get(sessionRef(cleanSessionId));
    if (!sessSnap.exists()) {
      throw new Error('Sesi praktikum tidak ditemukan.');
    }

    const sessData = sessSnap.data() as Omit<SessionDoc, 'id'>;
    if (sessData.status !== 'DIBUKA') {
      throw new Error(
        sessData.status === 'BELUM_DIBUKA'
          ? 'Sesi praktikum belum dibuka oleh asisten.'
          : 'Sesi praktikum sudah ditutup.',
      );
    }

    // Jika rules mengizinkan baca dokumen yang belum ada (resource == null), pastikan belum ada di dalam transaksi.
    try {
      const currentAtt = await tx.get(targetRef);
      if (currentAtt.exists()) {
        throw new Error('Presensi Anda sudah tercatat pada sesi ini.');
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? '';
      if (
        err instanceof Error &&
        err.message === 'Presensi Anda sudah tercatat pada sesi ini.'
      ) {
        throw err;
      }
      // Abaikan permission-denied pada baca dokumen yang belum ada karena rule allow update: if false tetap menolak duplikasi.
      if (!code.includes('permission-denied')) {
        throw err;
      }
    }

    const payload: Record<string, unknown> = {
      sessionId: cleanSessionId,
      classId: sessData.classId,
      praktikanUid: authUid,
      attendedAt: serverTimestamp(),
      ...(trimmedNote ? { catatan: trimmedNote } : {}),
    };

    tx.set(targetRef, payload);
  });
}

/**
 * Listener real-time status presensi praktikan pada satu sesi tertentu.
 * Menggunakan equality query `where('praktikanUid', '==', authUid)` agar aman terhadap Security Rules
 * meskipun dokumen presensi belum dibuat.
 */
export function subscribeMySessionAttendance(
  sessionId: string,
  uid: string | null | undefined,
  callback: (attendance: AttendanceDoc | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const activeUid = uid || requireUid();
  return onSnapshot(
    query(
      attendancesCol(),
      where('praktikanUid', '==', activeUid),
      where('sessionId', '==', sessionId),
    ),
    (snap) => {
      const first = snap.docs[0];
      callback(first ? toAttendance(first) : null);
    },
    (error) => onError(toError(error)),
  );
}

/**
 * Listener real-time seluruh riwayat presensi milik praktikan yang sedang login.
 */
export function subscribeMyAttendances(
  uid: string | null | undefined,
  callback: (attendances: AttendanceDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const activeUid = uid || requireUid();
  return onSnapshot(
    query(attendancesCol(), where('praktikanUid', '==', activeUid)),
    (snap) => callback(sortByAttendedDesc(snap.docs.map(toAttendance))),
    (error) => onError(toError(error)),
  );
}

/** Membaca dokumen kelas tunggal (diizinkan oleh rule isMember(classId) maupun isAsisten()). */
export async function getClassById(classId: string): Promise<ClassDoc | null> {
  if (!classId) return null;
  const snap = await getDoc(classRef(classId));
  return withId<ClassDoc>(snap);
}

/** Listener dokumen kelas tunggal untuk menampilkan mataPraktikum & kodeKelas pada layar praktikan. */
export function subscribeClassById(
  classId: string,
  callback: (classDoc: ClassDoc | null) => void,
  onError?: ErrorCallback,
): Unsubscribe {
  if (!classId) {
    callback(null);
    return () => undefined;
  }
  return onSnapshot(
    classRef(classId),
    (snap) => callback(withId<ClassDoc>(snap)),
    (error) => onError?.(toError(error)),
  );
}

