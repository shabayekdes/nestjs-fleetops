import { addDaysUtc, todayUtc } from '../common/date-only.js';
import type { Prisma } from '../generated/prisma/client.js';

/** A license expiring within this many days (inclusive) is "expiring soon". */
export const LICENSE_EXPIRING_SOON_DAYS = 30;

export const LicenseStatus = {
  VALID: 'VALID',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
} as const;

export type LicenseStatus = (typeof LicenseStatus)[keyof typeof LicenseStatus];

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

/**
 * EXPIRED before today (UTC); EXPIRING_SOON from today through today + 30 days
 * inclusive; VALID later.
 */
export function computeLicenseStatus(
  expiresOn: Date,
  now = new Date(),
): LicenseStatus {
  const today = todayUtc(now).getTime();
  const time = expiresOn.getTime();
  if (time < today) return LicenseStatus.EXPIRED;
  if (time <= addDaysUtc(todayUtc(now), LICENSE_EXPIRING_SOON_DAYS).getTime()) {
    return LicenseStatus.EXPIRING_SOON;
  }
  return LicenseStatus.VALID;
}

/** Prisma filter on `licenseExpiresOn` matching exactly `computeLicenseStatus`. */
export function licenseExpiresOnFilter(
  status: LicenseStatus,
  now = new Date(),
): Prisma.DateTimeFilter {
  const today = todayUtc(now);
  const limit = addDaysUtc(today, LICENSE_EXPIRING_SOON_DAYS);
  switch (status) {
    case LicenseStatus.EXPIRED:
      return { lt: today };
    case LicenseStatus.EXPIRING_SOON:
      return { gte: today, lte: limit };
    case LicenseStatus.VALID:
      return { gt: limit };
  }
}
