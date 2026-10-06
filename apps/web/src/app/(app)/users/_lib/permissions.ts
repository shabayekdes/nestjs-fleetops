import type { Role } from '@/lib/api/types';

/**
 * Whether the UI offers the Users screens. Usability only: the API decides
 * (the whole /users controller is ADMIN only), and a 403 is still handled.
 */
export function canManageUsers(role: Role): boolean {
  return role === 'ADMIN';
}
