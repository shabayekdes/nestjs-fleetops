/** True for a real calendar date written as "YYYY-MM-DD". */
export function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** The UTC calendar date `days` from the UTC date of `now`, as "YYYY-MM-DD". */
export function utcDateFromToday(days: number, now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  )
    .toISOString()
    .slice(0, 10);
}

const MIN_MONTH_YEAR = 1900;

/** True for "YYYY-MM" with a real month and a year of 1900 or later. */
export function isMonth(value: string): boolean {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match !== null && Number(match[1]) >= MIN_MONTH_YEAR;
}
