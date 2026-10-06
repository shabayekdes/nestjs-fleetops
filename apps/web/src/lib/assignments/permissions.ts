import type { Role } from '@/lib/api/types';

/**
 * Whether the UI offers the assignment pages and actions. Usability only: the
 * API decides, and a 403 is still handled.
 */
export function canManageAssignments(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
