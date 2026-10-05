/** Parses "YYYY-MM-DD" as midnight UTC. The caller must validate the format. */
export const parseDateOnly = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

/** Formats a date as "YYYY-MM-DD" (UTC). */
export const toDateOnly = (date: Date): string =>
  date.toISOString().slice(0, 10);

/**
 * A license is valid through its expiry date inclusive (UTC): it is expired
 * only when the expiry date is before today at 00:00 UTC.
 */
export function isLicenseExpired(expiresOn: Date, now = new Date()): boolean {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return expiresOn.getTime() < startOfToday;
}
