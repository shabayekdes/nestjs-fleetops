const formatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Formats an ISO timestamp in UTC, e.g. "Jun 15, 2026, 10:00 AM UTC". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatter.format(date)} UTC`;
}

const dateOnlyFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/**
 * Formats a calendar date ("YYYY-MM-DD") without any time zone shift, e.g.
 * "Jan 31, 2024". Anything that is not a real date is returned unchanged.
 */
export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }
  return dateOnlyFormatter.format(date);
}

/**
 * Groups the integer part of a decimal string with commas and keeps exactly
 * `fractionDigits` digits: ("9999999999.99", 2) gives "9,999,999,999.99". It
 * works on the string, so no precision is lost. Input that is not a plain
 * non-negative decimal with at most `fractionDigits` fraction digits is
 * returned unchanged.
 */
export function formatDecimal(value: string, fractionDigits: number): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) return value;
  const fraction = match[2] ?? '';
  if (fraction.length > fractionDigits) return value;
  const integer = (match[1] as string)
    .replace(/^0+(?=\d)/, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fractionDigits === 0
    ? integer
    : `${integer}.${fraction.padEnd(fractionDigits, '0')}`;
}

const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-03" gives "Mar 2026". Anything that is not a real month is unchanged. */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return value;
  return monthFormatter.format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
  );
}

const kmFormatter = new Intl.NumberFormat('en');

/** 120000 gives "120,000 km". */
export function formatKm(km: number): string {
  return `${kmFormatter.format(km)} km`;
}
