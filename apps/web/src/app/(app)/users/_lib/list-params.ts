import {
  DEFAULT_LIMIT,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { isRole } from '@/lib/auth/roles';
import type { Role } from '@/lib/api/types';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export type UserListQuery = {
  page: number;
  limit: number;
  role?: Role;
};

export type ParsedUserListParams = {
  query: UserListQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

/**
 * Reads the list's search params leniently: an invalid value is dropped (and
 * reported), so a hand-edited address never breaks the page. Unknown params,
 * such as `notice`, are ignored silently and never forwarded to the API.
 */
export function parseUserListParams(
  raw: RawSearchParams,
): ParsedUserListParams {
  const ignored: string[] = [];
  const query: UserListQuery = { ...parsePageAndLimit(raw, ignored) };

  const role = readSingleParam(raw, 'role', ignored);
  // An empty value counts as absent. The API wants the exact upper-case value.
  if (role !== undefined && role !== '') {
    if (isRole(role)) query.role = role;
    else ignored.push('role');
  }

  return { query, ignored, hasFilters: query.role !== undefined };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function userListParams(
  query: Partial<UserListQuery>,
): Record<string, string | number | undefined> {
  return {
    role: query.role,
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function userListHref(
  query: Partial<UserListQuery>,
  overrides: Partial<UserListQuery> = {},
): string {
  return buildHref('/users', userListParams({ ...query, ...overrides }));
}
