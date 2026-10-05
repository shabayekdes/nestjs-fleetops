import { addDaysUtc, parseDateOnly, todayUtc } from '../common/date-only.js';
import { ServiceStatus } from '../generated/prisma/client.js';
import {
  computeServiceStatus,
  SERVICE_DUE_SOON_DAYS,
} from './service-status.js';

const NOW = new Date('2026-06-15T10:30:00.000Z');
const day = (offset: number): Date => addDaysUtc(todayUtc(NOW), offset);

describe('computeServiceStatus', () => {
  it('uses a 14 day window', () => {
    expect(SERVICE_DUE_SOON_DAYS).toBe(14);
  });

  it('returns UNKNOWN for no due date', () => {
    expect(computeServiceStatus(null, NOW)).toBe(ServiceStatus.UNKNOWN);
  });

  it.each([-1, -365])('returns OVERDUE for today%i days', (offset) => {
    expect(computeServiceStatus(day(offset), NOW)).toBe(ServiceStatus.OVERDUE);
  });

  it.each([0, 1, 14])('returns DUE_SOON for today+%i', (offset) => {
    expect(computeServiceStatus(day(offset), NOW)).toBe(ServiceStatus.DUE_SOON);
  });

  it.each([15, 60, 3650])('returns OK for today+%i', (offset) => {
    expect(computeServiceStatus(day(offset), NOW)).toBe(ServiceStatus.OK);
  });

  it('flips at the UTC midnight boundary', () => {
    const due = parseDateOnly('2026-06-15');
    expect(
      computeServiceStatus(due, new Date('2026-06-15T23:59:59.999Z')),
    ).toBe(ServiceStatus.DUE_SOON);
    expect(
      computeServiceStatus(due, new Date('2026-06-16T00:00:00.000Z')),
    ).toBe(ServiceStatus.OVERDUE);
  });

  it('flips from DUE_SOON to OK at the 14 day edge', () => {
    const due = parseDateOnly('2026-06-29');
    expect(
      computeServiceStatus(due, new Date('2026-06-15T00:00:00.000Z')),
    ).toBe(ServiceStatus.DUE_SOON);
    expect(
      computeServiceStatus(due, new Date('2026-06-14T23:59:59.999Z')),
    ).toBe(ServiceStatus.OK);
  });

  it('defaults now to the current clock', () => {
    expect(computeServiceStatus(parseDateOnly('2000-01-01'))).toBe(
      ServiceStatus.OVERDUE,
    );
  });
});
