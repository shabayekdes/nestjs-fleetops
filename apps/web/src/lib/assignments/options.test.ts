import { describe, expect, it } from 'vitest';
import type { Driver, Vehicle } from '@/lib/api/types';
import { driverOptionLabel, vehicleOptionLabel } from './options';

const driver = {
  id: 'd',
  firstName: 'Jordan',
  lastName: 'Lee',
  licenseNumber: 'LIC-1',
  licenseExpiresOn: '2030-01-01',
  licenseStatus: 'VALID',
} as Driver;

describe('option labels', () => {
  it('labels a driver, and marks an expired license from the API status', () => {
    expect(driverOptionLabel(driver)).toBe('Jordan Lee (LIC-1)');
    expect(driverOptionLabel({ ...driver, licenseStatus: 'EXPIRED' })).toBe(
      'Jordan Lee (LIC-1) — license expired',
    );
    expect(
      driverOptionLabel({ ...driver, licenseStatus: 'EXPIRING_SOON' }),
    ).toBe('Jordan Lee (LIC-1)');
  });

  it('does not recompute the status from the date', () => {
    expect(
      driverOptionLabel({ ...driver, licenseExpiresOn: '2000-01-01' }),
    ).toBe('Jordan Lee (LIC-1)');
  });

  it('labels a vehicle with the plate, or the VIN without one', () => {
    const vehicle = {
      make: { id: 'make-1', name: 'Ford' },
      model: { id: 'model-1', name: 'Transit' },
      vin: 'VIN17',
      licensePlate: 'AB-1',
    } as Vehicle;
    expect(vehicleOptionLabel(vehicle)).toBe('Ford Transit (AB-1)');
    expect(vehicleOptionLabel({ ...vehicle, licensePlate: null })).toBe(
      'Ford Transit (VIN17)',
    );
  });
});
