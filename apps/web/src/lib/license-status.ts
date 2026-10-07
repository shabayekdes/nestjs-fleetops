import { isDateOnly } from './date-only';

export const LICENSE_EXPIRING_DAYS = 30;

export type LicenseStatus = 'expired' | 'expiring' | 'valid';

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
