import {
  DEFAULT_LIMIT,
  parseDateRange,
  parsePageAndLimit,
} from '@/lib/list-params';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };

export type FuelListQuery = {
  page: number;
  limit: number;
  from?: string;
  to?: string;
};

export type ParsedFuelListParams = {
  query: FuelListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

/** Reads the search params leniently: an invalid one is dropped and reported. */
export function parseFuelListParams(
  raw: RawSearchParams,
): ParsedFuelListParams {
  const ignored: string[] = [];
  const { page, limit } = parsePageAndLimit(raw, ignored);
  const query: FuelListQuery = { page, limit };

  const range = parseDateRange(raw, ignored);
  if (range.from !== undefined) query.from = range.from;
  if (range.to !== undefined) query.to = range.to;

  return {
    query,
    ignored,
    hasFilters: query.from !== undefined || query.to !== undefined,
  };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function fuelListParams(
  query: Partial<FuelListQuery>,
): Record<string, string | number | undefined> {
  return {
    from: query.from,
    to: query.to,
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function fuelPath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/fuel`;
}

export function fuelListHref(
  vehicleId: string,
  query: Partial<FuelListQuery>,
  overrides: Partial<FuelListQuery> = {},
): string {
  return buildHref(
    fuelPath(vehicleId),
    fuelListParams({ ...query, ...overrides }),
  );
}
