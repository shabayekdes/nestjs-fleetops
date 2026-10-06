import { describe, expect, it } from 'vitest';
import { canManageVehicles } from './permissions';

describe('canManageVehicles', () => {
  it('allows ADMIN and MANAGER but not DRIVER', () => {
    expect(canManageVehicles('ADMIN')).toBe(true);
    expect(canManageVehicles('MANAGER')).toBe(true);
    expect(canManageVehicles('DRIVER')).toBe(false);
  });
});
