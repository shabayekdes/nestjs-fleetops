import { addDaysUtc, todayUtc } from '../common/date-only.js';
import { ServiceStatus } from '../generated/prisma/client.js';

/** A vehicle is DUE_SOON from today through this many days ahead (inclusive). */
export const SERVICE_DUE_SOON_DAYS = 14;

/**
 * Pure service status for a next-service due date (date-only, UTC):
 * none -> UNKNOWN, before today -> OVERDUE, today..today+14 -> DUE_SOON,
 * later -> OK.
 */
export function computeServiceStatus(
  nextServiceDueOn: Date | null,
  now: Date = new Date(),
): ServiceStatus {
  if (nextServiceDueOn === null) return ServiceStatus.UNKNOWN;
  const today = todayUtc(now);
  if (nextServiceDueOn.getTime() < today.getTime()) {
    return ServiceStatus.OVERDUE;
  }
  if (
    nextServiceDueOn.getTime() <=
    addDaysUtc(today, SERVICE_DUE_SOON_DAYS).getTime()
  ) {
    return ServiceStatus.DUE_SOON;
  }
  return ServiceStatus.OK;
}
