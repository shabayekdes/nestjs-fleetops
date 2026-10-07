import {
  DEFAULT_LIMIT,
  parseInteger,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { isServiceStatus } from '@/lib/service-status';
import type { ServiceStatus } from '@/lib/api/types';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };
const MAX_TEXT_LENGTH = 50;
const MIN_YEAR = 1900;

export type VehicleListQuery = {
  page: number;
  limit: number;
  make?: string;
  model?: string;
  year?: number;
  serviceStatus?: ServiceStatus;
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

  const { page, limit } = parsePageAndLimit(raw, ignored);
  query.page = page;
  query.limit = limit;

  function field(name: string): string | undefined {
    return readSingleParam(raw, name, ignored);
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

  const serviceStatus = field('serviceStatus');
  if (serviceStatus !== undefined && serviceStatus !== '') {
    if (isServiceStatus(serviceStatus)) query.serviceStatus = serviceStatus;
    else ignored.push('serviceStatus');
  }

  return {
    query,
    ignored,
    hasFilters:
      query.make !== undefined ||
      query.model !== undefined ||
      query.year !== undefined ||
      query.serviceStatus !== undefined,
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
    serviceStatus: query.serviceStatus,
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
