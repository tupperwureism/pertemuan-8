import type { AttendanceTimeliness } from '@/types/firebase';

export const DEFAULT_GRACE_PERIOD_MINUTES = 15;
export const DEFAULT_FINE_AMOUNT = 10_000;

export interface TimelinessEvaluation {
  timeliness: AttendanceTimeliness;
  isLate: boolean;
  lateMinutes: number;
  gracePeriodMinutes: number;
  deadlineMs: number;
}

function validNonNegative(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** Tepat di batas toleransi masih dianggap tepat waktu. */
export function evaluateAttendanceTimeliness(
  startsAtMs: number,
  attendedAtMs: number,
  gracePeriodMinutes?: number | null,
): TimelinessEvaluation {
  const grace = validNonNegative(gracePeriodMinutes, DEFAULT_GRACE_PERIOD_MINUTES);
  const safeStartsAt = Number.isFinite(startsAtMs) ? startsAtMs : attendedAtMs;
  const safeAttendedAt = Number.isFinite(attendedAtMs) ? attendedAtMs : safeStartsAt;
  const deadlineMs = safeStartsAt + grace * 60_000;
  const isLate = safeAttendedAt > deadlineMs;
  const lateMinutes = isLate
    ? Math.max(1, Math.ceil((safeAttendedAt - deadlineMs) / 60_000))
    : 0;

  return {
    timeliness: isLate ? 'TERLAMBAT' : 'TEPAT_WAKTU',
    isLate,
    lateMinutes,
    gracePeriodMinutes: grace,
    deadlineMs,
  };
}

/** Nominal nol valid untuk menonaktifkan denda; nilai tidak valid memakai default. */
export function resolveFineAmount(fineAmount?: number | null): number {
  return validNonNegative(fineAmount, DEFAULT_FINE_AMOUNT);
}

export function formatRupiah(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(safeAmount);
}
