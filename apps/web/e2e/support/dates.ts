import { formatDateOnly } from '../../src/lib/format';

/** "Jan 15, 2026", as the app shows a calendar date (UTC, no shift). */
export function fmtDate(iso: string): string {
  return formatDateOnly(iso);
}

/** "YYYY-MM-DD" of the 15th of the month `offset` months from now (UTC). */
export function midMonthDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15),
  )
    .toISOString()
    .slice(0, 10);
}

/** "YYYY-MM" of an ISO date. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
