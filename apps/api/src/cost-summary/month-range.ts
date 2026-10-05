/** Pure helpers for "YYYY-MM" month strings (UTC). */

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Months since year 0, so month arithmetic is plain integer math. */
export function monthIndex(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return year * 12 + (monthNumber - 1);
}

export function formatMonth(index: number): string {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`;
}

export function currentMonth(now: Date = new Date()): string {
  return formatMonth(now.getUTCFullYear() * 12 + now.getUTCMonth());
}

export function addMonths(month: string, count: number): string {
  return formatMonth(monthIndex(month) + count);
}

/** Number of months from `from` to `to`, both inclusive (negative range -> <= 0). */
export function countMonths(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from) + 1;
}

/** Every month from `from` to `to` inclusive, ascending. */
export function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to); i++) {
    months.push(formatMonth(i));
  }
  return months;
}
