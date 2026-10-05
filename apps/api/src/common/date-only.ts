import { ValidateBy, type ValidationOptions } from 'class-validator';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE = '$property must be in YYYY-MM-DD format';

const MS_PER_DAY = 86_400_000;
export const MIN_DATE_ONLY = '1900-01-01';

/** Parses "YYYY-MM-DD" as midnight UTC. The caller must validate the format. */
export const parseDateOnly = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

/** Formats a date as "YYYY-MM-DD" (UTC). */
export const toDateOnly = (date: Date): string =>
  date.toISOString().slice(0, 10);

/** Midnight UTC of the current day. */
export const todayUtc = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Adds whole days to a date (UTC arithmetic). */
export const addDaysUtc = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

/**
 * Valid "YYYY-MM-DD" date that is >= 1900-01-01 and <= today (UTC) + 1 day.
 * The extra day tolerates clients in time zones ahead of UTC. Evaluated per
 * validation so it follows the clock.
 */
export function IsNotAfterTomorrowUtc(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNotAfterTomorrowUtc',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
            return false;
          }
          const date = parseDateOnly(value);
          if (Number.isNaN(date.getTime())) return false;
          return (
            value >= MIN_DATE_ONLY &&
            date.getTime() <= addDaysUtc(todayUtc(), 1).getTime()
          );
        },
        defaultMessage: (): string =>
          `$property must not be before ${MIN_DATE_ONLY} or after tomorrow (UTC)`,
      },
    },
    options,
  );
}
