import type { LicenseStatus } from '@/lib/api/types';

/** Ordered for the filter select. */
export const LICENSE_STATUSES = [
  'EXPIRED',
  'EXPIRING_SOON',
  'VALID',
] as const satisfies readonly LicenseStatus[];

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  EXPIRED: 'Expired',
  EXPIRING_SOON: 'Expires soon',
  VALID: 'Valid',
};

export function isLicenseStatus(value: unknown): value is LicenseStatus {
  return (
    typeof value === 'string' &&
    (LICENSE_STATUSES as readonly string[]).includes(value)
  );
}
