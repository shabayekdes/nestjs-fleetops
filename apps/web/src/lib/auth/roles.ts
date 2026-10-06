import type { Role } from '@/lib/api/types';

/** Every role, in display order. */
export const ROLES = [
  'ADMIN',
  'MANAGER',
  'DRIVER',
] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  DRIVER: 'Driver',
};

/** Display label for a role. Display only; never an authorization check. */
export function formatRole(role: Role): string {
  return ROLE_LABELS[role];
}
