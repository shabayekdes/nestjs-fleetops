import { describe, expect, it } from 'vitest';
import { formatRole } from './roles';

describe('formatRole', () => {
  it('maps every role to a label', () => {
    expect(formatRole('ADMIN')).toBe('Admin');
    expect(formatRole('MANAGER')).toBe('Manager');
    expect(formatRole('DRIVER')).toBe('Driver');
  });
});
