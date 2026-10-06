import { z } from 'zod';
import type { Role, UpdateUserRequest } from '@/lib/api/types';
import { ROLES } from '@/lib/auth/roles';

export const USER_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'password',
  'role',
] as const;
export type UserField = (typeof USER_FIELDS)[number];

/** Plain string values of the form, as typed by the user (never a password). */
export type UserFormValues = Partial<Record<UserField, string>>;

/** The normalized fields that can be edited. */
export type UserInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
};

const firstName = z
  .string()
  .trim()
  .min(1, 'Enter a first name')
  .max(100, 'At most 100 characters');
const lastName = z
  .string()
  .trim()
  .min(1, 'Enter a last name')
  .max(100, 'At most 100 characters');
// Usability only. The format is checked by the browser (type=email) and the
// API, which has the last word.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter an email')
  .max(254, 'At most 254 characters');
const role = z.enum(ROLES, { error: 'Choose a role' });

export const createUserSchema = z.object({
  firstName,
  lastName,
  email,
  // Never trimmed: spaces are part of a password.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'At most 128 characters'),
  role,
});

/** Edit form: a missing role (disabled select) means "unchanged". */
export const editUserSchema = z.object({
  firstName,
  lastName,
  email,
  role: role.optional(),
});

/**
 * The fields that differ between the original and the submitted values,
 * compared after normalization. A missing role counts as unchanged.
 */
export function changedUserFields(
  original: UserInput,
  next: Omit<UserInput, 'role'> & { role?: Role | undefined },
): UpdateUserRequest {
  const changes: UpdateUserRequest = {};
  if (original.firstName !== next.firstName) changes.firstName = next.firstName;
  if (original.lastName !== next.lastName) changes.lastName = next.lastName;
  if (original.email !== next.email) changes.email = next.email;
  if (next.role !== undefined && original.role !== next.role) {
    changes.role = next.role;
  }
  return changes;
}
