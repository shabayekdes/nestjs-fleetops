import { z } from 'zod';
import type {
  CreateMaintenanceRecordRequest,
  MaintenanceRecord,
  MaintenanceType,
  UpdateMaintenanceRecordRequest,
} from '@/lib/api/types';
import { isDateOnly } from '@/lib/date-only';
import { canonicalDecimal } from '@/lib/decimal';
import { MAINTENANCE_TYPES } from './maintenance-types';

export const MAINTENANCE_FIELDS = [
  'type',
  'performedOn',
  'cost',
  'odometerKm',
  'vendor',
  'description',
  'nextServiceDueOn',
] as const;
export type MaintenanceField = (typeof MAINTENANCE_FIELDS)[number];

/** Plain string values of the form, as typed by the user. */
export type MaintenanceFormValues = Partial<Record<MaintenanceField, string>>;

export type MaintenanceInput = {
  type: MaintenanceType;
  performedOn: string;
  cost: string;
  odometerKm: number | null;
  vendor: string | null;
  description: string | null;
  nextServiceDueOn: string | null;
};

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((value): string | null => (value === '' ? null : value));
}

/**
 * Format checks only; the API validates ranges and the rule that the next
 * service date must be after the service date, and has the last word.
 */
export const maintenanceSchema = z.object({
  type: z.enum(MAINTENANCE_TYPES, 'Choose a type'),
  performedOn: z.string().trim().refine(isDateOnly, 'Enter a valid date'),
  cost: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount such as 89.90'),
  odometerKm: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\d{1,7}$/.test(value),
      'Enter a whole number of kilometers',
    )
    .transform((value): number | null => (value === '' ? null : Number(value))),
  vendor: optionalText(100),
  description: optionalText(500),
  nextServiceDueOn: z
    .string()
    .trim()
    .refine((value) => value === '' || isDateOnly(value), 'Enter a valid date')
    .transform((value): string | null => (value === '' ? null : value)),
});

/** The form values of an existing record (or of a bound original). */
export function maintenanceInputToValues(
  input: MaintenanceInput,
): Record<MaintenanceField, string> {
  return {
    type: input.type,
    performedOn: input.performedOn,
    cost: input.cost,
    odometerKm: input.odometerKm === null ? '' : String(input.odometerKm),
    vendor: input.vendor ?? '',
    description: input.description ?? '',
    nextServiceDueOn: input.nextServiceDueOn ?? '',
  };
}

export function maintenanceRecordToInput(
  record: MaintenanceRecord,
): MaintenanceInput {
  return {
    type: record.type,
    performedOn: record.performedOn,
    cost: record.cost,
    odometerKm: record.odometerKm,
    vendor: record.vendor,
    description: record.description,
    nextServiceDueOn: record.nextServiceDueOn,
  };
}

/** The API rejects empty optional values on create, so leave them out. */
export function toCreateBody(
  input: MaintenanceInput,
): CreateMaintenanceRecordRequest {
  const body: CreateMaintenanceRecordRequest = {
    type: input.type,
    performedOn: input.performedOn,
    cost: input.cost,
  };
  if (input.odometerKm !== null) body.odometerKm = input.odometerKm;
  if (input.vendor !== null) body.vendor = input.vendor;
  if (input.description !== null) body.description = input.description;
  if (input.nextServiceDueOn !== null) {
    body.nextServiceDueOn = input.nextServiceDueOn;
  }
  return body;
}

/**
 * The fields that differ between the original and the submitted values,
 * compared after normalization (cost as a 2-decimal string, so "89.9" equals
 * "89.90"). A cleared optional field is `null`.
 */
export function changedMaintenanceFields(
  original: MaintenanceInput,
  next: MaintenanceInput,
): UpdateMaintenanceRecordRequest {
  const changes: UpdateMaintenanceRecordRequest = {};
  if (original.type !== next.type) changes.type = next.type;
  if (original.performedOn !== next.performedOn) {
    changes.performedOn = next.performedOn;
  }
  if (canonicalDecimal(original.cost, 2) !== canonicalDecimal(next.cost, 2)) {
    changes.cost = next.cost;
  }
  if (original.odometerKm !== next.odometerKm) {
    changes.odometerKm = next.odometerKm;
  }
  if (original.vendor !== next.vendor) changes.vendor = next.vendor;
  if (original.description !== next.description) {
    changes.description = next.description;
  }
  if (original.nextServiceDueOn !== next.nextServiceDueOn) {
    changes.nextServiceDueOn = next.nextServiceDueOn;
  }
  return changes;
}
