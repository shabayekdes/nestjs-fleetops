import {
  buildHref,
  singleParam,
  type RawSearchParams,
} from '@/lib/search-params';

export const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 1_000_000;
const MAX_TEXT_LENGTH = 50;
const MIN_YEAR = 1900;

export type VehicleListQuery = {
  page: number;
  limit: number;
  make?: string;
  model?: string;
  year?: number;
};

export type ParsedVehicleListParams = {
  query: VehicleListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

export function maxVehicleYear(): number {
  return new Date().getUTCFullYear() + 1;
}

function parseInteger(
  raw: string | undefined,
  pattern: RegExp,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || !pattern.test(raw)) return undefined;
  const value = Number(raw);
  return value >= min && value <= max ? value : undefined;
}

function parseText(raw: string | undefined): string | undefined | null {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value === '') return undefined;
  return value.length > MAX_TEXT_LENGTH ? null : value;
}

/**
 * Reads the list's search params leniently: each param is checked on its own
 * and an invalid one is dropped (and reported), so a hand-edited address never
 * breaks the page. Unknown params, such as `notice`, are ignored silently.
 */
export function parseVehicleListParams(
  raw: RawSearchParams,
): ParsedVehicleListParams {
  const ignored: string[] = [];
  const query: VehicleListQuery = { page: 1, limit: DEFAULT_LIMIT };

  function field(name: string): string | undefined {
    const value = raw[name];
    if (value === undefined) return undefined;
    const single = singleParam(value);
    if (single === undefined) ignored.push(name);
    return single;
  }

  const page = field('page');
  if (page !== undefined) {
    const value = parseInteger(page, /^\d+$/, 1, MAX_PAGE);
    if (value === undefined) ignored.push('page');
    else query.page = value;
  }

  const limit = field('limit');
  if (limit !== undefined) {
    const value = parseInteger(limit, /^\d+$/, 1, MAX_LIMIT);
    if (value === undefined) ignored.push('limit');
    else query.limit = value;
  }

  for (const name of ['make', 'model'] as const) {
    const value = parseText(field(name));
    if (value === null) ignored.push(name);
    else if (value !== undefined) query[name] = value;
  }

  const year = field('year');
  if (year !== undefined && year.trim() !== '') {
    const value = parseInteger(year, /^\d{4}$/, MIN_YEAR, maxVehicleYear());
    if (value === undefined) ignored.push('year');
    else query.year = value;
  }

  return {
    query,
    ignored,
    hasFilters:
      query.make !== undefined ||
      query.model !== undefined ||
      query.year !== undefined,
  };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function vehicleListParams(
  query: Partial<VehicleListQuery>,
): Record<string, string | number | undefined> {
  return {
    make: query.make,
    model: query.model,
    year: query.year,
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function vehicleListHref(
  query: Partial<VehicleListQuery>,
  overrides: Partial<VehicleListQuery> = {},
): string {
  return buildHref('/vehicles', vehicleListParams({ ...query, ...overrides }));
}
