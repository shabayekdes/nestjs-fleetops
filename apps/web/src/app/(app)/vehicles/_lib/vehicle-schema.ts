import { z } from 'zod';
import type { UpdateVehicleRequest } from '@/lib/api/types';
import { maxVehicleYear } from './list-params';

export const VEHICLE_FIELDS = [
  'make',
  'model',
  'year',
  'vin',
  'licensePlate',
] as const;
export type VehicleField = (typeof VEHICLE_FIELDS)[number];

/** Plain string values of the form, as typed by the user. */
export type VehicleFormValues = Partial<Record<VehicleField, string>>;

export type VehicleInput = {
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string | null;
};

const MIN_YEAR = 1900;

/**
 * Usability checks only; the API validates everything again. Built per call so
 * the year bound follows the clock.
 */
export function createVehicleSchema() {
  const maxYear = maxVehicleYear();
  return z.object({
    make: z
      .string()
      .trim()
      .min(1, 'Enter a make')
      .max(50, 'At most 50 characters'),
    model: z
      .string()
      .trim()
      .min(1, 'Enter a model')
      .max(50, 'At most 50 characters'),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Enter a 4-digit year')
      .transform(Number)
      .pipe(
        z
          .number()
          .min(MIN_YEAR, `Year must be ${MIN_YEAR} or later`)
          .max(maxYear, `Year must be ${maxYear} or earlier`),
      ),
    vin: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().length(17, 'VIN must be 17 characters')),
    licensePlate: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().max(15, 'At most 15 characters'))
      .transform((value): string | null => (value === '' ? null : value)),
  });
}

/**
 * The fields that differ between the original and the submitted values,
 * compared after normalization (trim, VIN and plate uppercased, year as a
 * number, an empty plate as null). A cleared plate is `null`.
 */
export function changedVehicleFields(
  original: VehicleInput,
  next: VehicleInput,
): UpdateVehicleRequest {
  const changes: UpdateVehicleRequest = {};
  if (original.make !== next.make) changes.make = next.make;
  if (original.model !== next.model) changes.model = next.model;
  if (original.year !== next.year) changes.year = next.year;
  if (original.vin !== next.vin) changes.vin = next.vin;
  if (original.licensePlate !== next.licensePlate) {
    changes.licensePlate = next.licensePlate;
  }
  return changes;
}
