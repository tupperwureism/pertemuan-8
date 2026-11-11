import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@react-native-firebase/firestore';

import { COLLECTIONS, type ErrorCallback, type Unsubscribe, type UserDoc } from '@/types/firebase';

import { firestore, toError, userRef } from './firebase';

export interface NewUserProfileInput {
  uid: string;
  email: string;
  nama: string;
  nomorInduk: string;
}

/**
 * Membuat users/{uid}. Role SELALU 'praktikan': registrasi publik tidak boleh memilih role,
 * dan Security Rules menolak create dengan role lain. Role asisten diprovisikan PM lewat Console.
 */
export async function createUserProfile(input: NewUserProfileInput): Promise<void> {
  await setDoc(userRef(input.uid), {
    uid: input.uid,
    email: input.email,
    nama: input.nama.trim(),
    nomorInduk: input.nomorInduk.trim(),
    role: 'praktikan',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Normalisasi dokumen users. Akun asisten diprovisikan PM manual di Console dengan field `nim`
 * dan tanpa createdAt/updatedAt, sedangkan kontrak tim memakai `nomorInduk` + timestamp.
 * Pembaca menerima keduanya agar akun hasil provisioning PM tetap valid.
 */
export function toUserDoc(id: string, data: Record<string, unknown>): UserDoc {
  const { nim, ...rest } = data;
  return {
    ...(rest as Omit<UserDoc, 'id' | 'nomorInduk'>),
    id,
    nomorInduk: (data.nomorInduk as string | undefined) ?? (nim as string | undefined) ?? '',
    createdAt: (data.createdAt as UserDoc['createdAt']) ?? null,
    updatedAt: (data.updatedAt as UserDoc['updatedAt']) ?? null,
  };
}

/** Listener profil. callback(null) berarti dokumen belum ada (profil belum dibuat). */
export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserDoc | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    userRef(uid),
    (snap) => callback(snap.exists() ? toUserDoc(snap.id, snap.data() as Record<string, unknown>) : null),
    (error) => onError(toError(error)),
  );
}

/** Khusus asisten (rules): mencari praktikan berdasarkan email untuk menambah anggota kelas. */
export async function findPraktikanByEmail(email: string): Promise<UserDoc | null> {
  const snap = await getDocs(
    query(
      collection(firestore(), COLLECTIONS.users),
      where('email', '==', email.trim().toLowerCase()),
      where('role', '==', 'praktikan'),
      limit(1),
    ),
  );
  const first = snap.docs[0];
  return first ? toUserDoc(first.id, first.data() as Record<string, unknown>) : null;
}
