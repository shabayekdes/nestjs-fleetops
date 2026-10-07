import { z } from 'zod';
import type {
  CreateFuelLogRequest,
  FuelLog,
  UpdateFuelLogRequest,
} from '@/lib/api/types';
import { isDateOnly } from '@/lib/date-only';
import { canonicalDecimal } from '@/lib/decimal';

export const FUEL_FIELDS = [
  'fueledOn',
  'liters',
  'totalCost',
  'odometerKm',
] as const;
export type FuelField = (typeof FUEL_FIELDS)[number];

/** Plain string values of the form, as typed by the user. */
export type FuelFormValues = Partial<Record<FuelField, string>>;

export type FuelInput = {
  fueledOn: string;
  liters: string;
  totalCost: string;
  odometerKm: number | null;
};

/**
 * Format checks only; the API validates ranges and has the last word.
 */
export const fuelSchema = z.object({
  fueledOn: z.string().trim().refine(isDateOnly, 'Enter a valid date'),
  liters: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,3})?$/, 'Enter an amount such as 45.500')
    .refine((value) => /[1-9]/.test(value), 'Enter more than 0 liters'),
  totalCost: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount such as 80.00'),
  odometerKm: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\d{1,7}$/.test(value),
      'Enter a whole number of kilometers',
    )
    .transform((value): number | null => (value === '' ? null : Number(value))),
});

/** The form values of an existing log (or of a bound original). */
export function fuelInputToValues(input: FuelInput): Record<FuelField, string> {
  return {
    fueledOn: input.fueledOn,
    liters: input.liters,
    totalCost: input.totalCost,
    odometerKm: input.odometerKm === null ? '' : String(input.odometerKm),
  };
}

export function fuelLogToInput(log: FuelLog): FuelInput {
  return {
    fueledOn: log.fueledOn,
    liters: log.liters,
    totalCost: log.totalCost,
    odometerKm: log.odometerKm,
  };
}

/** The API rejects an empty odometer on create, so leave it out. */
export function toCreateBody(input: FuelInput): CreateFuelLogRequest {
  const body: CreateFuelLogRequest = {
    fueledOn: input.fueledOn,
    liters: input.liters,
    totalCost: input.totalCost,
  };
  if (input.odometerKm !== null) body.odometerKm = input.odometerKm;
  return body;
}

/**
 * The fields that differ between the original and the submitted values,
 * compared after normalization (liters to 3 and cost to 2 decimals, so "45.5"
 * equals "45.500"). A cleared odometer is `null`.
 */
export function changedFuelFields(
  original: FuelInput,
  next: FuelInput,
): UpdateFuelLogRequest {
  const changes: UpdateFuelLogRequest = {};
  if (original.fueledOn !== next.fueledOn) changes.fueledOn = next.fueledOn;
  if (
    canonicalDecimal(original.liters, 3) !== canonicalDecimal(next.liters, 3)
  ) {
    changes.liters = next.liters;
  }
  if (
    canonicalDecimal(original.totalCost, 2) !==
    canonicalDecimal(next.totalCost, 2)
  ) {
    changes.totalCost = next.totalCost;
  }
  if (original.odometerKm !== next.odometerKm) {
    changes.odometerKm = next.odometerKm;
  }
  return changes;
}
