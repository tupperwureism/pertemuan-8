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
 * loading        : listener auth/profil belum memberi hasil pertama.
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // true selama registrasi berjalan: dokumen profil memang belum ada sesaat setelah akun Auth dibuat.
  const registeringRef = useRef(false);

  const uid = user?.uid ?? null;

  // Satu-satunya listener auth di aplikasi; di-unsubscribe saat provider ditutup.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setError(null);
      if (nextUser) {
        setStatus('loading');
      } else {
        setProfile(null);
        setStatus('signedOut');
      }
    });
    return unsubscribe;
  }, []);

  // Listener profil mengikuti UID login.
  useEffect(() => {
    if (!uid) return;
    return subscribeUserProfile(
      uid,
      (nextProfile) => {
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
        setProfile(null);
        setError(friendlyError(err));
        setStatus('profileError');
      },
    );
  }, [uid, attempt]);

  const signIn = useCallback((email: string, password: string) => signInService(email, password), []);

  const register = useCallback(async (input: RegisterInput) => {
    registeringRef.current = true;
    try {
      await registerPraktikan(input);
    } finally {
      registeringRef.current = false;
    }
  }, []);

  const signOut = useCallback(() => signOutUser(), []);

  const retryProfile = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
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
    [status, user, uid, profile, error, signIn, register, signOut, retryProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
