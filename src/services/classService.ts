import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';

import {
  classMemberId,
  COLLECTIONS,
  type ClassDoc,
  type ClassMemberDoc,
  type ErrorCallback,
  type Unsubscribe,
  type UserRole,
} from '@/types/firebase';

import { firestore, requireUid, toError } from './firebase';

export interface ClassInput {
  nama: string;
  mataPraktikum: string;
  kodeKelas: string;
}

const classesCol = () => collection(firestore(), COLLECTIONS.classes);
const membersCol = () => collection(firestore(), COLLECTIONS.classMembers);

function toClass(snap: { id: string; data(): unknown }): ClassDoc {
  return { ...(snap.data() as Omit<ClassDoc, 'id'>), id: snap.id };
}

function toMember(snap: { id: string; data(): unknown }): ClassMemberDoc {
  return { ...(snap.data() as Omit<ClassMemberDoc, 'id'>), id: snap.id };
}

// ------------------------------------------------------------------ Kelas

/** Asisten: semua kelas. */
export function subscribeClasses(
  callback: (classes: ClassDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    query(classesCol(), orderBy('nama', 'asc')),
    (snap) => callback(snap.docs.map(toClass)),
    (error) => onError(toError(error)),
  );
}

/**
 * Kelas yang boleh dilihat pengguna login: asisten = semua kelas; praktikan = kelas tempat ia
 * menjadi anggota (membership -> satu listener dokumen per kelas, aman untuk rules).
 */
export function subscribeVisibleClasses(
  role: UserRole,
  callback: (classes: ClassDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  if (role === 'asisten') return subscribeClasses(callback, onError);

  let uid: string;
  try {
    uid = requireUid();
  } catch (error) {
    onError(toError(error));
    return () => undefined;
  }
  let cancelled = false;
  const perClass = new Map<string, Unsubscribe>();
  const results = new Map<string, ClassDoc>();
  const emit = () => {
    if (!cancelled) callback([...results.values()].sort((a, b) => a.nama.localeCompare(b.nama)));
  };

  const stopRoot = onSnapshot(
    query(membersCol(), where('uid', '==', uid)),
    (snap) => {
      if (cancelled) return;
      const ids = new Set(snap.docs.map((d) => d.data().classId as string));
      for (const [id, unsub] of perClass) {
        if (!ids.has(id)) {
          unsub();
          perClass.delete(id);
          results.delete(id);
        }
      }
      ids.forEach((id) => {
        if (perClass.has(id)) return;
        perClass.set(
          id,
          onSnapshot(
            doc(firestore(), COLLECTIONS.classes, id),
            (classSnap) => {
              if (classSnap.exists()) results.set(id, toClass(classSnap));
              else results.delete(id);
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

  return () => {
    cancelled = true;
    stopRoot();
    perClass.forEach((unsub) => unsub());
    perClass.clear();
  };
}

/** Membuat kelas; asisten pembuat otomatis menjadi assistantIds[0]. */
export async function createClass(input: ClassInput): Promise<string> {
  const uid = requireUid();
  const ref = await addDoc(classesCol(), {
    nama: input.nama.trim(),
    mataPraktikum: input.mataPraktikum.trim(),
    kodeKelas: input.kodeKelas.trim(),
    assistantIds: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateClass(classId: string, input: ClassInput): Promise<void> {
  await updateDoc(doc(firestore(), COLLECTIONS.classes, classId), {
    nama: input.nama.trim(),
    mataPraktikum: input.mataPraktikum.trim(),
    kodeKelas: input.kodeKelas.trim(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Menghapus kelas beserta keanggotaan dan sesinya (batch, maks 500 operasi).
 * Presensi/izin yang sudah ada tidak dihapus di sini.
 */
export async function deleteClass(classId: string): Promise<void> {
  const [members, sessions] = await Promise.all([
    getDocs(query(membersCol(), where('classId', '==', classId))),
    getDocs(query(collection(firestore(), COLLECTIONS.sessions), where('classId', '==', classId))),
  ]);
  const refs = [...members.docs, ...sessions.docs].map((d) => d.ref);
  if (refs.length > 498) {
    throw new Error('Kelas memiliki terlalu banyak data terkait. Hapus sesi/anggota secara bertahap.');
  }
  const batch = writeBatch(firestore());
  refs.forEach((ref) => batch.delete(ref));
  batch.delete(doc(firestore(), COLLECTIONS.classes, classId));
  await batch.commit();
}

// ------------------------------------------------------------ Keanggotaan

/** Asisten: seluruh anggota satu kelas. */
export function subscribeClassMembers(
  classId: string,
  callback: (members: ClassMemberDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    query(membersCol(), where('classId', '==', classId)),
    (snap) => callback(snap.docs.map(toMember)),
    (error) => onError(toError(error)),
  );
}

/** Keanggotaan milik pengguna login (UID dari Auth, bukan parameter). */
export function subscribeMyMemberships(
  callback: (members: ClassMemberDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const uid = requireUid();
  return onSnapshot(
    query(membersCol(), where('uid', '==', uid)),
    (snap) => callback(snap.docs.map(toMember)),
    (error) => onError(toError(error)),
  );
}

export async function addClassMember(
  classId: string,
  uid: string,
  role: UserRole = 'praktikan',
): Promise<void> {
  await setDoc(doc(firestore(), COLLECTIONS.classMembers, classMemberId(classId, uid)), {
    classId,
    uid,
    role,
    joinedAt: serverTimestamp(),
  });
}

export async function removeClassMember(classId: string, uid: string): Promise<void> {
  await deleteDoc(doc(firestore(), COLLECTIONS.classMembers, classMemberId(classId, uid)));
}
