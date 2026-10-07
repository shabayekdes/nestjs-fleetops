import { describe, expect, it } from 'vitest';
import { canManageVehicleRecords, canManageVehicles } from './permissions';

describe('canManageVehicles', () => {
  it('allows ADMIN and MANAGER but not DRIVER', () => {
    expect(canManageVehicles('ADMIN')).toBe(true);
    expect(canManageVehicles('MANAGER')).toBe(true);
    expect(canManageVehicles('DRIVER')).toBe(false);
  });
});

describe('canManageVehicleRecords', () => {
  it('allows ADMIN and MANAGER but not DRIVER', () => {
    expect(canManageVehicleRecords('ADMIN')).toBe(true);
    expect(canManageVehicleRecords('MANAGER')).toBe(true);
    expect(canManageVehicleRecords('DRIVER')).toBe(false);
  });
});
