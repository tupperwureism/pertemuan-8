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

import { distanceMeters, isWithinRadius, MAX_ACCURACY_METER } from '@/lib/geo';
import {
  attendanceId,
  COLLECTIONS,
  type AttendanceDoc,
  type ClassDoc,
  type ErrorCallback,
  type LabDoc,
  type PermissionStatus,
  type SessionDoc,
  type Unsubscribe,
} from '@/types/firebase';

import { firestore, requireUid, toError, withId } from './firebase';
import { subscribeAttendances } from './sessionService';

export { subscribeAttendances };

/** Lokasi perangkat yang dikirim saat presensi pada sesi yang terikat ke laboratorium. */
export interface AttendanceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

const attendancesCol = () => collection(firestore(), COLLECTIONS.attendances);
const attendanceRef = (id: string) => doc(firestore(), COLLECTIONS.attendances, id);
const sessionRef = (sessionId: string) => doc(firestore(), COLLECTIONS.sessions, sessionId);
const labRef = (labId: string) => doc(firestore(), COLLECTIONS.labs, labId);
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
 * Bila sesi memiliki `labId`, wajib menyertakan `location` valid dengan akurasi <= MAX_ACCURACY_METER
 * serta jarak berada dalam radius laboratorium.
 */
export async function recordAttendance(
  sessionId: string,
  uid?: string,
  note?: string,
  location?: AttendanceLocation,
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
  const [existingSnap, existingPermSnap] = await Promise.all([
    getDocs(
      query(
        attendancesCol(),
        where('praktikanUid', '==', authUid),
        where('sessionId', '==', cleanSessionId),
      ),
    ),
    getDocs(
      query(
        collection(firestore(), COLLECTIONS.permissions),
        where('praktikanUid', '==', authUid),
        where('sessionId', '==', cleanSessionId),
      ),
    ),
  ]);
  if (!existingSnap.empty) {
    throw new Error('Presensi Anda sudah tercatat pada sesi ini.');
  }
  const existingPermStatus = (existingPermSnap.docs[0]?.data() as { status?: PermissionStatus } | undefined)?.status;
  if (existingPermStatus && existingPermStatus !== 'REJECTED') {
    throw new Error(
      existingPermStatus === 'APPROVED'
        ? 'Izin Anda pada sesi ini sudah diterima. Anda tidak dapat melakukan presensi.'
        : 'Anda sudah mengajukan izin yang sedang menunggu pemeriksaan pada sesi ini.',
    );
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

    const payload: Record<string, unknown> = {
      sessionId: cleanSessionId,
      classId: sessData.classId,
      praktikanUid: authUid,
      attendedAt: serverTimestamp(),
      ...(trimmedNote ? { catatan: trimmedNote } : {}),
    };

    const sessionLabId =
      typeof sessData.labId === 'string' && sessData.labId.trim().length > 0
        ? sessData.labId
        : null;

    if (sessionLabId) {
      if (
        !location ||
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        throw new Error('Lokasi belum tersedia.');
      }
      if (
        location.latitude < -90 ||
        location.latitude > 90 ||
        location.longitude < -180 ||
        location.longitude > 180
      ) {
        throw new Error('Koordinat lokasi tidak valid.');
      }
      if (
        location.accuracy === null ||
        !Number.isFinite(location.accuracy) ||
        location.accuracy < 0
      ) {
        throw new Error('Akurasi GPS tidak diketahui, coba lagi.');
      }
      if (location.accuracy > MAX_ACCURACY_METER) {
        throw new Error(
          `Akurasi GPS rendah (±${Math.round(location.accuracy)} m, maksimal ${MAX_ACCURACY_METER} m). Pindah ke area terbuka lalu coba lagi.`,
        );
      }

      const labSnap = await tx.get(labRef(sessionLabId));
      if (!labSnap.exists()) {
        throw new Error('Data laboratorium untuk sesi ini tidak ditemukan. Hubungi asisten.');
      }
      const labData = labSnap.data() as Omit<LabDoc, 'id'>;
      const rawDistance = distanceMeters(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: labData.latitude, longitude: labData.longitude },
      );
      const roundedDistance = Math.round(rawDistance);

      if (!isWithinRadius(rawDistance, labData.radiusMeter)) {
        throw new Error(
          `Anda berada ${roundedDistance} m dari lab, radius ${labData.radiusMeter} m.`,
        );
      }

      payload.labId = sessionLabId;
      payload.latitude = location.latitude;
      payload.longitude = location.longitude;
      payload.accuracy = location.accuracy;
      payload.distanceMeter = roundedDistance;
    }

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

