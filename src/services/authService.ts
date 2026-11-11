import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';

import { firebaseAuth } from './firebase';
import { createUserProfile } from './userService';

/** Terjemahan kode error Firebase Auth/Firestore ke pesan ramah. */
export function friendlyError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/user-disabled':
      return 'Akun ini dinonaktifkan. Hubungi asisten atau admin.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Email atau kata sandi salah.';
    case 'auth/email-already-in-use':
      return 'Email sudah terdaftar. Silakan masuk.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/network-request-failed':
    case 'firestore/unavailable':
      return 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
    case 'auth/operation-not-allowed':
      return 'Login email/password belum diaktifkan di Firebase Console.';
    case 'firestore/permission-denied':
      return 'Anda tidak memiliki izin untuk tindakan ini.';
    default:
      return 'Terjadi kesalahan. Silakan coba lagi.';
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(firebaseAuth());
}

/**
 * Registrasi publik: akun Auth lalu users/{uid} dengan role praktikan.
 * Bila pembuatan profil gagal, akun Auth yang baru dibuat dihapus (atau di-sign-out)
 * agar UI tidak berakhir pada akun setengah jadi dan pengguna dapat mendaftar ulang.
 */
export async function registerPraktikan(input: {
  email: string;
  password: string;
  nama: string;
  nomorInduk: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const credential = await createUserWithEmailAndPassword(firebaseAuth(), email, input.password);
  const user = credential.user;

  try {
    await createUserProfile({
      uid: user.uid,
      email: user.email ?? email,
      nama: input.nama,
      nomorInduk: input.nomorInduk,
    });
  } catch (error) {
    try {
      await user.delete();
    } catch {
      await firebaseSignOut(firebaseAuth()).catch(() => undefined);
    }
    throw error;
  }
}
