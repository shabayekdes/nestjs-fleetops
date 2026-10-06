import type { Role } from '@/lib/api/types';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  DRIVER: 'Driver',
};

/** Display label for a role. Display only; never an authorization check. */
export function formatRole(role: Role): string {
  return ROLE_LABELS[role];
}
