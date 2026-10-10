import {
  DEFAULT_LIMIT,
  parseInteger,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { isUuid } from '@/lib/ids';
import { isServiceStatus } from '@/lib/service-status';
import type { ServiceStatus } from '@/lib/api/types';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };
const MIN_YEAR = 1900;

export type VehicleListQuery = {
  page: number;
  limit: number;
  makeId?: string;
  modelId?: string;
  vehicleTypeId?: string;
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

  for (const name of ['makeId', 'modelId', 'vehicleTypeId'] as const) {
    const value = field(name)?.trim();
    if (value === undefined || value === '') continue;
    if (isUuid(value)) query[name] = value;
    else ignored.push(name);
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
      query.makeId !== undefined ||
      query.modelId !== undefined ||
      query.vehicleTypeId !== undefined ||
      query.year !== undefined ||
      query.serviceStatus !== undefined,
  };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function vehicleListParams(
  query: Partial<VehicleListQuery>,
): Record<string, string | number | undefined> {
  return {
    makeId: query.makeId,
    modelId: query.modelId,
    vehicleTypeId: query.vehicleTypeId,
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
