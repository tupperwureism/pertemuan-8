import { useCallback, useEffect, useState } from 'react';

import { subscribeClassMembers, subscribeVisibleClasses } from '@/services/classService';
import { subscribeAttendances, subscribeSession, subscribeSessions } from '@/services/sessionService';
import { fetchUsersByIds } from '@/services/userService';
import type { UserDoc, UserRole } from '@/types/firebase';

import { useSubscription } from './use-subscription';

/** Jadwal sesi milik pengguna login (asisten: semua; praktikan: kelas yang diikuti). */
export function useSessions() {
  return useSubscription(subscribeSessions);
}

export function useSession(sessionId: string | undefined) {
  const subscribe = useCallback(
    (cb: Parameters<typeof subscribeSession>[1], onError: Parameters<typeof subscribeSession>[2]) =>
      subscribeSession(sessionId ?? '', cb, onError),
    [sessionId],
  );
  return useSubscription(sessionId ? subscribe : null);
}

export function useVisibleClasses(role: UserRole | null) {
  const subscribe = useCallback(
    (cb: Parameters<typeof subscribeVisibleClasses>[1], onError: Parameters<typeof subscribeVisibleClasses>[2]) =>
      subscribeVisibleClasses(role ?? 'praktikan', cb, onError),
    [role],
  );
  return useSubscription(role ? subscribe : null);
}

export function useClassMembers(classId: string | undefined) {
  const subscribe = useCallback(
    (cb: Parameters<typeof subscribeClassMembers>[1], onError: Parameters<typeof subscribeClassMembers>[2]) =>
      subscribeClassMembers(classId ?? '', cb, onError),
    [classId],
  );
  return useSubscription(classId ? subscribe : null);
}

/** Rekap presensi real-time satu sesi (khusus asisten). */
export function useSessionRecap(sessionId: string | undefined) {
  const subscribe = useCallback(
    (cb: Parameters<typeof subscribeAttendances>[1], onError: Parameters<typeof subscribeAttendances>[2]) =>
      subscribeAttendances(sessionId ?? '', cb, onError),
    [sessionId],
  );
  return useSubscription(sessionId ? subscribe : null);
}

/** Memuat profil untuk daftar UID (cache sederhana). Khusus asisten. */
export function useUserProfiles(uids: string[]): Record<string, UserDoc> {
  const [profiles, setProfiles] = useState<Record<string, UserDoc>>({});
  const key = [...new Set(uids)].sort().join(',');

  useEffect(() => {
    const missing = key ? key.split(',').filter((uid) => !(uid in profiles)) : [];
    if (missing.length === 0) return;
    let cancelled = false;
    fetchUsersByIds(missing).then((fetched) => {
      if (!cancelled) setProfiles((prev) => ({ ...prev, ...fetched }));
    });
    return () => {
      cancelled = true;
    };
    // `profiles` sengaja tidak menjadi dependensi: hanya kunci UID yang memicu pemuatan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profiles;
}
