import { DEFAULT_LIMIT, parsePageAndLimit } from '@/lib/list-params';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };

export type DriverListQuery = {
  page: number;
  limit: number;
};

export type ParsedDriverListParams = {
  query: DriverListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  /** The drivers list has no filters. */
  hasFilters: false;
};

/** Reads `page` and `limit` leniently; unknown params are ignored silently. */
export function parseDriverListParams(
  raw: RawSearchParams,
): ParsedDriverListParams {
  const ignored: string[] = [];
  const query = parsePageAndLimit(raw, ignored);
  return { query, ignored, hasFilters: false };
}

/** Search params for a list link, leaving out the defaults. */
export function driverListParams(
  query: Partial<DriverListQuery>,
): Record<string, string | number | undefined> {
  return {
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function driverListHref(
  query: Partial<DriverListQuery>,
  overrides: Partial<DriverListQuery> = {},
): string {
  return buildHref('/drivers', driverListParams({ ...query, ...overrides }));
}
