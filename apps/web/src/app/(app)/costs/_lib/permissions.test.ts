import { describe, expect, it } from 'vitest';
import { canViewFleetCosts } from './permissions';

describe('canViewFleetCosts', () => {
  it('allows ADMIN and MANAGER but not DRIVER', () => {
    expect(canViewFleetCosts('ADMIN')).toBe(true);
    expect(canViewFleetCosts('MANAGER')).toBe(true);
    expect(canViewFleetCosts('DRIVER')).toBe(false);
  });
});
