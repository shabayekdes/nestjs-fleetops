import { describe, expect, it } from 'vitest';
import type { Driver, Vehicle } from '@/lib/api/types';
import { driverOptionLabel, vehicleOptionLabel } from './options';

const now = new Date('2026-03-10T12:00:00Z');
const driver = {
  id: 'd',
  firstName: 'Jordan',
  lastName: 'Lee',
  licenseNumber: 'LIC-1',
  licenseExpiresOn: '2030-01-01',
} as Driver;

describe('option labels', () => {
  it('labels a driver, and marks an expired license', () => {
    expect(driverOptionLabel(driver, now)).toBe('Jordan Lee (LIC-1)');
    expect(
      driverOptionLabel({ ...driver, licenseExpiresOn: '2026-03-09' }, now),
    ).toBe('Jordan Lee (LIC-1) — license expired');
    expect(
      driverOptionLabel({ ...driver, licenseExpiresOn: '2026-03-10' }, now),
    ).toBe('Jordan Lee (LIC-1)');
  });

  it('labels a vehicle with the plate, or the VIN without one', () => {
    const vehicle = {
      make: 'Ford',
      model: 'Transit',
      vin: 'VIN17',
      licensePlate: 'AB-1',
    } as Vehicle;
    expect(vehicleOptionLabel(vehicle)).toBe('Ford Transit (AB-1)');
    expect(vehicleOptionLabel({ ...vehicle, licensePlate: null })).toBe(
      'Ford Transit (VIN17)',
    );
  });
});
