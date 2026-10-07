import type { LicenseStatus } from '@/lib/api/types';
import { isLicenseStatus } from '@/lib/license-status';
import {
  DEFAULT_LIMIT,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };

export type DriverListQuery = {
  page: number;
  limit: number;
  licenseStatus?: LicenseStatus;
};

export type ParsedDriverListParams = {
  query: DriverListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

/**
 * Reads `page`, `limit` and `licenseStatus` leniently; an invalid value is
 * dropped and reported, unknown params are ignored silently.
 */
export function parseDriverListParams(
  raw: RawSearchParams,
): ParsedDriverListParams {
  const ignored: string[] = [];
  const query: DriverListQuery = { ...parsePageAndLimit(raw, ignored) };

  const licenseStatus = readSingleParam(raw, 'licenseStatus', ignored);
  if (licenseStatus !== undefined && licenseStatus !== '') {
    if (isLicenseStatus(licenseStatus)) query.licenseStatus = licenseStatus;
    else ignored.push('licenseStatus');
  }

  return { query, ignored, hasFilters: query.licenseStatus !== undefined };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function driverListParams(
  query: Partial<DriverListQuery>,
): Record<string, string | number | undefined> {
  return {
    licenseStatus: query.licenseStatus,
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
