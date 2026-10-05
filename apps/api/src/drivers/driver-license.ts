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
