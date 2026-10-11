import type { TransformFnParams } from 'class-transformer';
import {
  ValidateBy,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Strict ISO 8601 instant: explicit Z or +-hh:mm offset is mandatory. */
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Region/City style names only: fixed offsets such as +03:00 do not match. */
const IANA_SHAPE = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;

/** True when the calendar day exists (month length and leap years). */
const isRealCalendarDay = (
  year: number,
  month: number,
  day: number,
): boolean => {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const isIsoInstant = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_INSTANT_PATTERN.test(value)) {
    return false;
  }
  // The pattern guarantees the shape; check the ranges on the string itself
  // because Date.parse rolls impossible days over (Feb 30 becomes Mar 2).
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  if (!isRealCalendarDay(year, month, day)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
};

export const isStrictDateOnly = (value: unknown): value is string =>
  typeof value === 'string' &&
  DATE_ONLY_PATTERN.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);

export const isIanaTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !IANA_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const toMs = (value: unknown): number =>
  typeof value === 'string' && (isIsoInstant(value) || isStrictDateOnly(value))
    ? new Date(value).getTime()
    : Number.NaN;

export const toLowerCase = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

/** Blank or non-numeric strings become NaN so IsNumber rejects them. */
export const toStrictNumber = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string'
    ? value.trim() === ''
      ? Number.NaN
      : Number(value)
    : value;

export function IsIsoInstant(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIsoInstant',
      validator: {
        validate: isIsoInstant,
        defaultMessage: (): string =>
          '$property must be an ISO 8601 timestamp with an explicit Z or +-hh:mm offset',
      },
    },
    options,
  );
}

export function IsStrictDateOnly(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStrictDateOnly',
      validator: {
        validate: isStrictDateOnly,
        defaultMessage: (): string =>
          '$property must be a valid date in YYYY-MM-DD format',
      },
    },
    options,
  );
}

/** Evaluated per validation so it follows the clock. */
export function IsNotAfterNowPlus(
  skewMs: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNotAfterNowPlus',
      constraints: [skewMs],
      validator: {
        validate: (value: unknown): boolean =>
          isIsoInstant(value) && toMs(value) <= Date.now() + skewMs,
        defaultMessage: (): string =>
          `$property must not be more than ${Math.round(skewMs / 60_000)} minutes in the future`,
      },
    },
    options,
  );
}

/** Value must be after (or, with allowEqual, not before) the other field. */
export function IsAfterField(
  field: string,
  allowEqual = false,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAfterField',
      constraints: [field, allowEqual],
      validator: {
        validate: (value: unknown, args?: ValidationArguments): boolean => {
          const other = toMs((args?.object as Record<string, unknown>)[field]);
          const own = toMs(value);
          // An invalid sibling is reported on the sibling itself.
          if (Number.isNaN(other)) return true;
          return allowEqual ? own >= other : own > other;
        },
        defaultMessage: (): string =>
          allowEqual
            ? `$property must not be before ${field}`
            : `$property must be after ${field}`,
      },
    },
    options,
  );
}

/** Value minus the other field must not exceed maxMs (date-only allowed). */
export function IsWithinRangeOf(
  field: string,
  maxMs: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isWithinRangeOf',
      constraints: [field, maxMs],
      validator: {
        validate: (value: unknown, args?: ValidationArguments): boolean => {
          const other = toMs((args?.object as Record<string, unknown>)[field]);
          if (Number.isNaN(other)) return true;
          return toMs(value) - other <= maxMs;
        },
        defaultMessage: (args?: ValidationArguments): string =>
          `$property must be within ${Math.round(maxMs / 86_400_000)} days of ${String(args?.constraints[0])}`,
      },
    },
    options,
  );
}

export function IsIanaTimeZone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIanaTimeZone',
      validator: {
        validate: isIanaTimeZone,
        defaultMessage: (): string =>
          '$property must be an IANA time zone name such as UTC or Africa/Cairo (fixed offsets are not accepted)',
      },
    },
    options,
  );
}
