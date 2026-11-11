import type { FirestoreTimestamp } from '@/types/firebase';

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });

const pad = (n: number) => String(n).padStart(2, '0');

/** "Rabu, 11 Nov 2026 • 08.00 - 10.00" (zona waktu perangkat). */
export function formatSessionTime(startsAt?: FirestoreTimestamp | null, endsAt?: FirestoreTimestamp | null): string {
  if (!startsAt || !endsAt) return '-';
  const start = startsAt.toDate();
  const end = endsAt.toDate();
  return `${dateFmt.format(start)} • ${timeFmt.format(start)} - ${timeFmt.format(end)}`;
}

/** Jam hadir dari attendedAt; "Menyimpan…" selama server timestamp belum dikonfirmasi. */
export function formatClock(ts?: FirestoreTimestamp | null): string {
  return ts ? timeFmt.format(ts.toDate()) : 'Menyimpan…';
}

export function toDateInput(ts?: FirestoreTimestamp | null): string {
  const d = ts ? ts.toDate() : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(ts?: FirestoreTimestamp | null, fallback = '08:00'): string {
  if (!ts) return fallback;
  const d = ts.toDate();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Menggabungkan "YYYY-MM-DD" + "HH:mm" (waktu lokal). Mengembalikan null bila tidak valid. */
export function parseDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  const valid =
    result.getFullYear() === year &&
    result.getMonth() === month - 1 &&
    result.getDate() === day &&
    hour < 24 &&
    minute < 60;
  return valid ? result : null;
}
