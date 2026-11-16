import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';

import { firebaseAuth } from './firebase';
import { createUserProfile } from './userService';

function extractErrorCode(error: unknown): string {
  const direct = (error as { code?: string } | null)?.code;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (error instanceof Error) {
    const bracketed = /^\[([^\]]+)\]/.exec(error.message);
    if (bracketed) return bracketed[1];
  }
  return '';
}

/** Terjemahan kode error Firebase Auth/Firestore ke pesan ramah. */
export function friendlyError(error: unknown): string {
  const code = extractErrorCode(error);
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
    case 'unavailable':
    case 'firestore/deadline-exceeded':
    case 'deadline-exceeded':
      return 'Tidak ada koneksi atau layanan sedang sibuk. Periksa jaringan lalu coba lagi.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
    case 'auth/operation-not-allowed':
      return 'Login email/password belum diaktifkan di Firebase Console.';
    case 'firestore/permission-denied':
    case 'permission-denied':
      return 'Anda tidak memiliki izin untuk tindakan ini.';
    case 'firestore/not-found':
    case 'not-found':
      return 'Data tidak ditemukan atau sudah dihapus.';
    case 'firestore/aborted':
    case 'aborted':
    case 'firestore/failed-precondition':
    case 'failed-precondition':
      return 'Perubahan gagal karena data baru saja berubah. Muat ulang lalu coba lagi.';
    case 'firestore/unauthenticated':
    case 'unauthenticated':
      return 'Sesi login tidak aktif. Silakan masuk kembali.';
    default:
      return 'Terjadi kesalahan. Silakan coba lagi.';
  }
}

/** Mengubah error menjadi pesan ramah UI (mempertahankan pesan validasi lokal, menerjemahkan error Firebase). */
export function getErrorMessage(error: unknown): string {
  if (extractErrorCode(error)) {
    return friendlyError(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return friendlyError(error);
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
