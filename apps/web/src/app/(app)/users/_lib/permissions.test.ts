import { describe, expect, it } from 'vitest';
import { canManageUsers } from './permissions';

describe('canManageUsers', () => {
  it('allows ADMIN only', () => {
    expect(canManageUsers('ADMIN')).toBe(true);
    expect(canManageUsers('MANAGER')).toBe(false);
    expect(canManageUsers('DRIVER')).toBe(false);
  });
});
