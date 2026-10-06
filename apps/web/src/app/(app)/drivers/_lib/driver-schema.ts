import { z } from 'zod';
import type { UpdateDriverRequest } from '@/lib/api/types';
import { isUuid } from '@/lib/ids';
import { isDateOnly } from '@/lib/license-status';

export const DRIVER_FIELDS = [
  'firstName',
  'lastName',
  'licenseNumber',
  'licenseExpiresOn',
  'userId',
] as const;
export type DriverField = (typeof DRIVER_FIELDS)[number];

/** Plain string values of the form, as typed by the user. */
export type DriverFormValues = Partial<Record<DriverField, string>>;

export type DriverInput = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseExpiresOn: string;
  /** `undefined`: the field is not in the form (unchanged); null: not linked. */
  userId?: string | null;
};

/**
 * Usability checks only; the API validates everything again. The license
 * number pattern is not checked here: the API's 400 shows under the field.
 */
export const driverSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter a first name')
    .max(100, 'At most 100 characters'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Enter a last name')
    .max(100, 'At most 100 characters'),
  licenseNumber: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .min(1, 'Enter a license number')
        .max(30, 'At most 30 characters'),
    ),
  licenseExpiresOn: z.string().trim().refine(isDateOnly, 'Enter a valid date'),
  userId: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => value === undefined || value === '' || isUuid(value),
      'Choose a user from the list',
    )
    .transform((value): string | null | undefined =>
      value === undefined ? undefined : value === '' ? null : value,
    ),
});

/**
 * The fields that differ between the original and the submitted values,
 * compared after normalization. A `userId` of `undefined` (the field was not
 * in the form) means unchanged; `null` unlinks the user.
 */
export function changedDriverFields(
  original: DriverInput,
  next: DriverInput,
): UpdateDriverRequest {
  const changes: UpdateDriverRequest = {};
  if (original.firstName !== next.firstName) changes.firstName = next.firstName;
  if (original.lastName !== next.lastName) changes.lastName = next.lastName;
  if (original.licenseNumber !== next.licenseNumber) {
    changes.licenseNumber = next.licenseNumber;
  }
  if (original.licenseExpiresOn !== next.licenseExpiresOn) {
    changes.licenseExpiresOn = next.licenseExpiresOn;
  }
  if (next.userId !== undefined && (original.userId ?? null) !== next.userId) {
    changes.userId = next.userId;
  }
  return changes;
}
