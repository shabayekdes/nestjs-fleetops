import type { Role } from '@/lib/api/types';

/** Usability only: the API answers 403 for a DRIVER. */
export function canViewFleetCosts(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
