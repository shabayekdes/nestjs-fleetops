import { describe, expect, it } from 'vitest';
import {
  LICENSE_STATUSES,
  LICENSE_STATUS_LABELS,
  isLicenseStatus,
} from './license-status';

describe('license status', () => {
  it('has a label for every status', () => {
    expect(LICENSE_STATUSES.map((s) => LICENSE_STATUS_LABELS[s])).toEqual([
      'Expired',
      'Expires soon',
      'Valid',
    ]);
  });

  it('recognises only the API values', () => {
    for (const status of LICENSE_STATUSES) {
      expect(isLicenseStatus(status)).toBe(true);
    }
    for (const value of ['expired', 'EXPIRING', '', undefined, 1, null]) {
      expect(isLicenseStatus(value)).toBe(false);
    }
  });
});
