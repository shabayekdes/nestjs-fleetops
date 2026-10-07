import type { ServiceStatus } from '@/lib/api/types';

/** Ordered for the filter select. */
export const SERVICE_STATUSES = [
  'OVERDUE',
  'DUE_SOON',
  'OK',
  'UNKNOWN',
] as const satisfies readonly ServiceStatus[];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  OK: 'OK',
  UNKNOWN: 'No service date',
};

export function isServiceStatus(value: unknown): value is ServiceStatus {
  return (
    typeof value === 'string' &&
    (SERVICE_STATUSES as readonly string[]).includes(value)
  );
}
