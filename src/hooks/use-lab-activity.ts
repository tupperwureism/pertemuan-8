import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useSessions, useVisibleClasses } from '@/hooks/use-firestore-data';
import type { ClassDoc, LabDoc, SessionDoc } from '@/types/firebase';

export interface LabActivityEntry {
  session: SessionDoc;
  kelas: ClassDoc | null;
}

function enrich(session: SessionDoc | undefined, classes: Map<string, ClassDoc>): LabActivityEntry | null {
  if (!session) return null;
  return { session, kelas: classes.get(session.classId) ?? null };
}

/** Aktivitas real-time yang sedang berlangsung dan berikutnya pada satu laboratorium. */
export function useLabActivity(lab: LabDoc | null) {
  const { role } = useAuth();
  const sessionsState = useSessions();
  const classesState = useVisibleClasses(role);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const classesById = useMemo(
    () => new Map((classesState.data ?? []).map((item) => [item.id, item])),
    [classesState.data],
  );

  const activities = useMemo(() => {
    if (!lab) return { current: null, next: null };

    const labName = lab.nama.trim().toLocaleLowerCase('id-ID');
    const related = (sessionsState.data ?? []).filter((session) => {
      if (session.labId) return session.labId === lab.id;
      return session.ruangan.trim().toLocaleLowerCase('id-ID') === labName;
    });

    const active = related
      .filter((session) => {
        if (session.status === 'DIBUKA') return true;
        if (session.status === 'DITUTUP') return false;
        return session.startsAt.toMillis() <= now && now < session.endsAt.toMillis();
      })
      .sort((a, b) => {
        if (a.status === 'DIBUKA' && b.status !== 'DIBUKA') return -1;
        if (b.status === 'DIBUKA' && a.status !== 'DIBUKA') return 1;
        return b.startsAt.toMillis() - a.startsAt.toMillis();
      })[0];

    const next = related
      .filter(
        (session) =>
          session.id !== active?.id &&
          session.status === 'BELUM_DIBUKA' &&
          session.startsAt.toMillis() > now,
      )
      .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis())[0];

    return {
      current: enrich(active, classesById),
      next: enrich(next, classesById),
    };
  }, [classesById, lab, now, sessionsState.data]);

  const retry = useCallback(() => {
    sessionsState.retry();
    classesState.retry();
  }, [classesState, sessionsState]);

  return {
    ...activities,
    loading: sessionsState.loading || classesState.loading,
    error: sessionsState.error ?? classesState.error,
    retry,
  };
}
