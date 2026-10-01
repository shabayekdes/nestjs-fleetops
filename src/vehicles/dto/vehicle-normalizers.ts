import type { TransformFnParams } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const trimUpper = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const MIN_VEHICLE_YEAR = 1900;

/** Evaluated per validation, in UTC so the result is host-timezone independent. */
export const maxVehicleYear = (): number => new Date().getUTCFullYear() + 1;

export function IsNotAfterNextYear(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNotAfterNextYear',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'number' && value <= maxVehicleYear(),
        defaultMessage: (): string =>
          `$property must not be greater than ${maxVehicleYear()}`,
      },
    },
    options,
  );
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const LICENSE_PLATE_PATTERN = /^[A-Z0-9](?:[A-Z0-9 -]*[A-Z0-9])?$/;
export const VIN_MESSAGE =
  'vin must be 17 characters: digits and letters except I, O, Q';
export const LICENSE_PLATE_MESSAGE =
  'licensePlate may contain only letters, digits, spaces and hyphens, and must start and end with a letter or digit';
