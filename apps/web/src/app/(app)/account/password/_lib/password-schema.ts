import { z } from 'zod';

export const PASSWORD_FIELDS = [
  'currentPassword',
  'newPassword',
  'confirmPassword',
] as const;
export type PasswordField = (typeof PASSWORD_FIELDS)[number];

/**
 * Nothing is trimmed. The only cross-field check is that the confirmation
 * matches; "must differ from the current password" is the API's rule.
 */
export const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Enter your current password')
      .max(128, 'At most 128 characters'),
    newPassword: z
      .string()
      .min(12, 'New password must be at least 12 characters')
      .max(128, 'At most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
