import { describe, expect, it } from 'vitest';
import { licenseStatus } from './license-status';

const now = new Date('2026-03-10T12:00:00Z');

describe('licenseStatus', () => {
  it('is expired the day after the expiry date', () => {
    expect(licenseStatus('2026-03-09', now)).toBe('expired');
  });

  it('treats an expiry today as expiring, not expired', () => {
    expect(licenseStatus('2026-03-10', now)).toBe('expiring');
  });

  it('is expiring through today plus 30 days, inclusive', () => {
    expect(licenseStatus('2026-04-09', now)).toBe('expiring');
    expect(licenseStatus('2026-04-10', now)).toBe('valid');
  });

  it('uses the UTC date of now', () => {
    // 23:30 at UTC-5 on Mar 10 is already Mar 11 in UTC.
    expect(
      licenseStatus('2026-03-10', new Date('2026-03-10T23:30:00-05:00')),
    ).toBe('expired');
    // 00:30 at UTC+5 on Mar 10 is still Mar 9 in UTC.
    expect(
      licenseStatus('2026-03-09', new Date('2026-03-10T00:30:00+05:00')),
    ).toBe('expiring');
  });

  it('returns undefined for invalid input', () => {
    expect(licenseStatus('', now)).toBeUndefined();
    expect(licenseStatus('2026-02-30', now)).toBeUndefined();
    expect(licenseStatus('tomorrow', now)).toBeUndefined();
  });
});
