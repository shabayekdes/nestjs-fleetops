import { describe, expect, it } from 'vitest';
import { canManageAssignments } from '@/lib/assignments/permissions';
import { canManageDrivers } from './permissions';

describe('driver and assignment permissions', () => {
  it.each([
    ['ADMIN', true],
    ['MANAGER', true],
    ['DRIVER', false],
  ] as const)('%s -> %s', (role, expected) => {
    expect(canManageDrivers(role)).toBe(expected);
    expect(canManageAssignments(role)).toBe(expected);
  });
});
