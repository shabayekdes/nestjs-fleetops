export const LICENSE_EXPIRING_DAYS = 30;

export type LicenseStatus = 'expired' | 'expiring' | 'valid';

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function utcDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * How a driver's license expiry should be labelled. FOR DISPLAY ONLY: it never
 * blocks or enables an action. The API decides (it answers 422 when a license
 * has expired) and has the last word. A license is valid through its expiry
 * date, and "today" is the UTC date of `now`.
 */
export function licenseStatus(
  expiresOn: string,
  now: Date = new Date(),
): LicenseStatus | undefined {
  if (!isDateOnly(expiresOn)) return undefined;
  const today = utcDate(now.getTime());
  if (expiresOn < today) return 'expired';
  const [year, month, day] = today.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const limit = utcDate(Date.UTC(year, month - 1, day + LICENSE_EXPIRING_DAYS));
  return expiresOn <= limit ? 'expiring' : 'valid';
}
