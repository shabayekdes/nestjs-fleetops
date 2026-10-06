import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '@/lib/api/types';
import { toShellUser } from './shell-user';

const user: CurrentUser = {
  id: 'u1',
  organizationId: 'o1',
  organization: { id: 'o1', name: 'Acme Logistics', slug: 'acme' },
  firstName: 'Alex',
  lastName: 'Fleetwood',
  email: 'alex@acme.test',
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('toShellUser', () => {
  it('maps only the display fields', () => {
    expect(toShellUser(user)).toEqual({
      name: 'Alex Fleetwood',
      email: 'alex@acme.test',
      role: 'ADMIN',
      organizationName: 'Acme Logistics',
    });
  });

  it('leaks no ids', () => {
    const shell = toShellUser(user);
    expect(shell).not.toHaveProperty('id');
    expect(shell).not.toHaveProperty('organizationId');
  });
});
