import { isDateOnly } from '@/lib/date-only';
import { singleParam, type RawSearchParams } from '@/lib/search-params';

export const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 1_000_000;

/** A whole number from `raw` if it matches `pattern` and is within range. */
export function parseInteger(
  raw: string | undefined,
  pattern: RegExp,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || !pattern.test(raw)) return undefined;
  const value = Number(raw);
  return value >= min && value <= max ? value : undefined;
}

/**
 * The single string value of a search param. A repeated key (an array) is
 * invalid: the name is added to `ignored` and the value is dropped.
 */
export function readSingleParam(
  raw: RawSearchParams,
  name: string,
  ignored: string[],
): string | undefined {
  const value = raw[name];
  if (value === undefined) return undefined;
  const single = singleParam(value);
  if (single === undefined) ignored.push(name);
  return single;
}

/**
 * Reads `page` and `limit` leniently: an invalid value falls back to the
 * default and is reported in `ignored`.
 */
export function parsePageAndLimit(
  raw: RawSearchParams,
  ignored: string[],
): { page: number; limit: number } {
  const result = { page: 1, limit: DEFAULT_LIMIT };

  const page = readSingleParam(raw, 'page', ignored);
  if (page !== undefined) {
    const value = parseInteger(page, /^\d+$/, 1, MAX_PAGE);
    if (value === undefined) ignored.push('page');
    else result.page = value;
  }

  const limit = readSingleParam(raw, 'limit', ignored);
  if (limit !== undefined) {
    const value = parseInteger(limit, /^\d+$/, 1, MAX_LIMIT);
    if (value === undefined) ignored.push('limit');
    else result.limit = value;
  }

  return result;
}

/**
 * Reads the optional `from` and `to` calendar dates ("YYYY-MM-DD") leniently:
 * an invalid or repeated value is dropped and reported in `ignored`. There is
 * no `from <= to` check; the API answers 400 and the page shows its message.
 */
export function parseDateRange(
  raw: RawSearchParams,
  ignored: string[],
): { from?: string; to?: string } {
  const range: { from?: string; to?: string } = {};
  for (const name of ['from', 'to'] as const) {
    const value = readSingleParam(raw, name, ignored)?.trim();
    if (value === undefined || value === '') continue;
    if (isDateOnly(value)) range[name] = value;
    else ignored.push(name);
  }
  return range;
}
