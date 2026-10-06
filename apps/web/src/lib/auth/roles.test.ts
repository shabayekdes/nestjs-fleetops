import { describe, expect, it } from 'vitest';
import { ROLES, formatRole, isRole } from './roles';

describe('formatRole', () => {
  it('maps every role to a label', () => {
    expect(formatRole('ADMIN')).toBe('Admin');
    expect(formatRole('MANAGER')).toBe('Manager');
    expect(formatRole('DRIVER')).toBe('Driver');
  });
});

describe('isRole', () => {
  it('accepts exactly the three upper-case roles', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    for (const value of ['admin', 'ROOT', '', undefined, 1, ['ADMIN']]) {
      expect(isRole(value)).toBe(false);
    }
  });
});
