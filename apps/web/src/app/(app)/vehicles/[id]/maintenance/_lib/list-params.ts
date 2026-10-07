import type { MaintenanceType } from '@/lib/api/types';
import {
  DEFAULT_LIMIT,
  parseDateRange,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { buildHref, type RawSearchParams } from '@/lib/search-params';
import { isMaintenanceType } from './maintenance-types';

export { DEFAULT_LIMIT };

export type MaintenanceListQuery = {
  page: number;
  limit: number;
  type?: MaintenanceType;
  from?: string;
  to?: string;
};

export type ParsedMaintenanceListParams = {
  query: MaintenanceListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

/** Reads the search params leniently: an invalid one is dropped and reported. */
export function parseMaintenanceListParams(
  raw: RawSearchParams,
): ParsedMaintenanceListParams {
  const ignored: string[] = [];
  const { page, limit } = parsePageAndLimit(raw, ignored);
  const query: MaintenanceListQuery = { page, limit };

  const type = readSingleParam(raw, 'type', ignored);
  if (type !== undefined && type !== '') {
    if (isMaintenanceType(type)) query.type = type;
    else ignored.push('type');
  }

  const range = parseDateRange(raw, ignored);
  if (range.from !== undefined) query.from = range.from;
  if (range.to !== undefined) query.to = range.to;

  return {
    query,
    ignored,
    hasFilters:
      query.type !== undefined ||
      query.from !== undefined ||
      query.to !== undefined,
  };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function maintenanceListParams(
  query: Partial<MaintenanceListQuery>,
): Record<string, string | number | undefined> {
  return {
    type: query.type,
    from: query.from,
    to: query.to,
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function maintenancePath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/maintenance`;
}

export function maintenanceListHref(
  vehicleId: string,
  query: Partial<MaintenanceListQuery>,
  overrides: Partial<MaintenanceListQuery> = {},
): string {
  return buildHref(
    maintenancePath(vehicleId),
    maintenanceListParams({ ...query, ...overrides }),
  );
}
