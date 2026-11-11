/**
 * Satu-satunya titik akses instance Firebase. Service dan context lain mengimpor dari sini
 * (jangan memanggil getAuth/getFirestore atau membuat app tandingan di tempat lain).
 * Memakai API modular React Native Firebase.
 */
import { getAuth } from '@react-native-firebase/auth';
import {
  doc,
  getFirestore,
  type DocumentSnapshot,
} from '@react-native-firebase/firestore';

import { COLLECTIONS } from '@/types/firebase';

export const firebaseAuth = () => getAuth();
export const firestore = () => getFirestore();

/** UID pengguna yang sedang login; melempar bila belum login. Jangan terima UID dari input/route. */
export function requireUid(): string {
  const uid = getAuth().currentUser?.uid;
  if (!uid) {
    throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
  }
  return uid;
}

export const userRef = (uid: string) => doc(getFirestore(), COLLECTIONS.users, uid);

/** Menggabungkan id dokumen ke dalam data. Mengembalikan null bila dokumen tidak ada. */
export function withId<T extends { id: string }>(snap: DocumentSnapshot): T | null {
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<T, 'id'>), id: snap.id } as T;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
