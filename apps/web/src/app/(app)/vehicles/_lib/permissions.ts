import type { Role } from '@/lib/api/types';

/**
 * Whether the UI offers Add, Edit and Delete. Usability only: the API decides,
 * and a 403 is still handled.
 */
export function canManageVehicles(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

/**
 * Whether the UI offers the maintenance, fuel and cost pages. Usability only:
 * the API answers 403 for a driver.
 */
export function canManageVehicleRecords(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
