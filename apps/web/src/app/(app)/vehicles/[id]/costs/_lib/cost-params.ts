import { isMonth } from '@/lib/date-only';
import { readSingleParam } from '@/lib/list-params';
import type { RawSearchParams } from '@/lib/search-params';

export type CostQuery = { from?: string; to?: string };

/**
 * Reads `from` and `to` ("YYYY-MM") leniently: an invalid or repeated value is
 * dropped and reported. An absent param is not sent, so the API applies its
 * defaults (the last 12 months). There is no `from <= to` or range check; the
 * API answers 400 and the page shows its message.
 */
export function parseCostParams(raw: RawSearchParams): {
  query: CostQuery;
  ignored: string[];
} {
  const ignored: string[] = [];
  const query: CostQuery = {};
  for (const name of ['from', 'to'] as const) {
    const value = readSingleParam(raw, name, ignored)?.trim();
    if (value === undefined || value === '') continue;
    if (isMonth(value)) query[name] = value;
    else ignored.push(name);
  }
  return { query, ignored };
}

export function costsPath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/costs`;
}
