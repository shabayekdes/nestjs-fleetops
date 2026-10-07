import { describe, expect, it } from 'vitest';
import {
  SERVICE_STATUSES,
  SERVICE_STATUS_LABELS,
  isServiceStatus,
} from './service-status';

describe('service status', () => {
  it('labels every status in words', () => {
    expect(SERVICE_STATUS_LABELS).toEqual({
      OVERDUE: 'Overdue',
      DUE_SOON: 'Due soon',
      OK: 'OK',
      UNKNOWN: 'No service date',
    });
    expect([...SERVICE_STATUSES].sort()).toEqual(
      Object.keys(SERVICE_STATUS_LABELS).sort(),
    );
  });

  it('recognizes only the four values', () => {
    for (const status of SERVICE_STATUSES) {
      expect(isServiceStatus(status)).toBe(true);
    }
    for (const bad of ['overdue', 'LATE', '', undefined, ['OK'], 1]) {
      expect(isServiceStatus(bad)).toBe(false);
    }
  });
});
