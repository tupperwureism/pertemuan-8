import { onAuthStateChanged, type User } from '@react-native-firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { friendlyError, registerPraktikan, signIn as signInService, signOutUser } from '@/services/authService';
import { firebaseAuth } from '@/services/firebase';
import { subscribeUserProfile } from '@/services/userService';
import type { UserDoc, UserRole } from '@/types/firebase';

/**
 * loading        : menunggu hasil pertama listener auth, atau profil belum termuat setelah login.
 * signedOut      : tidak ada pengguna login.
 * profileMissing : login berhasil tetapi users/{uid} belum ada (mis. akun dibuat manual di Console).
 * profileError   : profil gagal dibaca (offline / permission-denied); bisa dicoba ulang.
 * ready          : login + profil tersedia; role bisa dipakai untuk guard route.
 */
export type AuthStatus = 'loading' | 'signedOut' | 'profileMissing' | 'profileError' | 'ready';

export interface RegisterInput {
  email: string;
  password: string;
  nama: string;
  nomorInduk: string;
}

interface AuthContextValue {
  status: AuthStatus;
  /** true sampai listener auth memberi hasil pertama (cold start). */
  initializing: boolean;
  /** true selama registrasi berjalan; layar daftar tetap tampil agar error dapat ditampilkan. */
  registering: boolean;
  user: User | null;
  /** UID Firebase Auth; satu-satunya sumber identitas (bukan route param). */
  uid: string | null;
  profile: UserDoc | null;
  role: UserRole | null;
  /** Pesan ramah untuk status profileError. */
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Mencoba membaca ulang profil (untuk profileMissing/profileError). */
  retryProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [initializing, setInitializing] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Dokumen profil memang belum ada sesaat setelah akun Auth dibuat saat registrasi.
  const registeringRef = useRef(false);
  const lastUidRef = useRef<string | null>(null);

  const uid = user?.uid ?? null;

  const resetToSignedOut = useCallback(() => {
    lastUidRef.current = null;
    setUser(null);
    setProfile(null);
    setError(null);
    setStatus('signedOut');
  }, []);

  // Satu-satunya listener auth di aplikasi; di-unsubscribe saat provider ditutup.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth(), (nextUser) => {
      setInitializing(false);
      if (!nextUser) {
        resetToSignedOut();
        return;
      }
      setUser(nextUser);
      // Hanya kembali ke loading bila UID benar-benar berganti.
      if (lastUidRef.current !== nextUser.uid) {
        lastUidRef.current = nextUser.uid;
        setProfile(null);
        setError(null);
        setStatus('loading');
      }
    });
    return unsubscribe;
  }, [resetToSignedOut]);

  // Listener profil mengikuti UID login. Event yang datang setelah sign-out/ganti akun diabaikan
  // (Firestore sering mengirim permission-denied tepat setelah sesi berakhir).
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const isCurrent = () => active && firebaseAuth().currentUser?.uid === uid;

    const unsubscribe = subscribeUserProfile(
      uid,
      (nextProfile) => {
        if (!isCurrent()) return;
        if (nextProfile) {
          setProfile(nextProfile);
          setError(null);
          setStatus('ready');
        } else if (!registeringRef.current) {
          setProfile(null);
          setStatus('profileMissing');
        }
      },
      (err) => {
        if (!isCurrent()) return;
        setProfile(null);
        setError(friendlyError(err));
        setStatus('profileError');
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  const signIn = useCallback((email: string, password: string) => signInService(email, password), []);

  const register = useCallback(async (input: RegisterInput) => {
    registeringRef.current = true;
    setRegistering(true);
    try {
      await registerPraktikan(input);
    } finally {
      registeringRef.current = false;
      setRegistering(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutUser();
    } finally {
      // Bila sesi sudah berakhir (mis. akun dihapus), pastikan UI tidak tertinggal di layar masalah.
      if (!firebaseAuth().currentUser) resetToSignedOut();
    }
  }, [resetToSignedOut]);

  const retryProfile = useCallback(() => {
    if (!firebaseAuth().currentUser) {
      resetToSignedOut();
      return;
    }
    setStatus('loading');
    setError(null);
    setAttempt((n) => n + 1);
  }, [resetToSignedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      initializing,
      registering,
      user,
      uid,
      profile,
      role: profile?.role ?? null,
      error,
      signIn,
      register,
      signOut,
      retryProfile,
    }),
    [status, initializing, registering, user, uid, profile, error, signIn, register, signOut, retryProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
