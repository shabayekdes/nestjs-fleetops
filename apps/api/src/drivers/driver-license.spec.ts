import { parseDateOnly, toDateOnly } from '../common/date-only.js';
import {
  computeLicenseStatus,
  isLicenseExpired,
  LicenseStatus,
  licenseExpiresOnFilter,
} from './driver-license.js';

describe('driver-license', () => {
  const now = new Date('2026-06-15T13:45:00.000Z');

  describe('isLicenseExpired', () => {
    it('is not expired when it expires today', () => {
      expect(isLicenseExpired(parseDateOnly('2026-06-15'), now)).toBe(false);
    });

    it('is expired when it expired yesterday', () => {
      expect(isLicenseExpired(parseDateOnly('2026-06-14'), now)).toBe(true);
    });

    it('is not expired when it expires tomorrow', () => {
      expect(isLicenseExpired(parseDateOnly('2026-06-16'), now)).toBe(false);
    });

    it('treats the last second of the expiry day (UTC) as still valid', () => {
      const expiry = parseDateOnly('2026-12-31');
      expect(
        isLicenseExpired(expiry, new Date('2026-12-31T23:59:59.000Z')),
      ).toBe(false);
    });

    it('is expired from 00:00:00 UTC the next day', () => {
      const expiry = parseDateOnly('2026-12-31');
      expect(
        isLicenseExpired(expiry, new Date('2027-01-01T00:00:00.000Z')),
      ).toBe(true);
    });

    it('defaults now to the current clock', () => {
      expect(isLicenseExpired(parseDateOnly('2000-01-01'))).toBe(true);
      expect(isLicenseExpired(parseDateOnly('2999-01-01'))).toBe(false);
    });
  });

  describe('computeLicenseStatus', () => {
    const at = (d: string, n = now) =>
      computeLicenseStatus(parseDateOnly(d), n);

    it('is EXPIRED yesterday', () => {
      expect(at('2026-06-14')).toBe(LicenseStatus.EXPIRED);
    });

    it('is EXPIRING_SOON today', () => {
      expect(at('2026-06-15')).toBe(LicenseStatus.EXPIRING_SOON);
    });

    it('is EXPIRING_SOON at today + 30 and VALID at +31', () => {
      expect(at('2026-07-15')).toBe(LicenseStatus.EXPIRING_SOON);
      expect(at('2026-07-16')).toBe(LicenseStatus.VALID);
    });

    it('flips at UTC midnight', () => {
      const expiry = '2026-12-31';
      expect(at(expiry, new Date('2026-12-31T23:59:59.999Z'))).toBe(
        LicenseStatus.EXPIRING_SOON,
      );
      expect(at(expiry, new Date('2027-01-01T00:00:00.000Z'))).toBe(
        LicenseStatus.EXPIRED,
      );
      expect(at('2027-01-30', new Date('2026-12-31T23:59:59.999Z'))).toBe(
        LicenseStatus.EXPIRING_SOON,
      );
      expect(at('2027-01-30', new Date('2026-12-30T23:59:59.999Z'))).toBe(
        LicenseStatus.VALID,
      );
    });
  });

  describe('licenseExpiresOnFilter', () => {
    const today = parseDateOnly('2026-06-15');
    const limit = parseDateOnly('2026-07-15');

    it('EXPIRED is before today', () => {
      expect(licenseExpiresOnFilter(LicenseStatus.EXPIRED, now)).toEqual({
        lt: today,
      });
    });

    it('EXPIRING_SOON is today through today + 30 inclusive', () => {
      expect(licenseExpiresOnFilter(LicenseStatus.EXPIRING_SOON, now)).toEqual({
        gte: today,
        lte: limit,
      });
    });

    it('VALID is after today + 30', () => {
      expect(licenseExpiresOnFilter(LicenseStatus.VALID, now)).toEqual({
        gt: limit,
      });
    });
  });

  describe('parseDateOnly / toDateOnly', () => {
    it('parses as midnight UTC', () => {
      expect(parseDateOnly('2027-03-09').toISOString()).toBe(
        '2027-03-09T00:00:00.000Z',
      );
    });

    it.each(['2024-02-29', '2026-12-31', '2027-01-01', '1999-07-04'])(
      'round-trips %s',
      (value) => {
        expect(toDateOnly(parseDateOnly(value))).toBe(value);
      },
    );

    it('formats only the UTC date part', () => {
      expect(toDateOnly(new Date('2026-06-15T23:59:59.999Z'))).toBe(
        '2026-06-15',
      );
    });
  });
});
