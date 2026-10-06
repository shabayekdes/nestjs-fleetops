import type { AssignmentListQuery } from '@/lib/assignments/assignments-api';
import {
  DEFAULT_LIMIT,
  parsePageAndLimit,
  readSingleParam,
} from '@/lib/list-params';
import { buildHref, type RawSearchParams } from '@/lib/search-params';

export { DEFAULT_LIMIT };

/** The page's own query: no vehicle or driver filter (those are detail pages). */
export type AssignmentsPageQuery = Pick<
  AssignmentListQuery,
  'page' | 'limit' | 'active'
>;

export type ParsedAssignmentListParams = {
  query: AssignmentsPageQuery;
  /** Names of params that were present but not valid, so they were dropped. */
  ignored: string[];
  hasFilters: boolean;
};

/**
 * Reads `page`, `limit` and `active` leniently. `active` is `true` or
 * `false`; an empty value means All, anything else is dropped and reported.
 */
export function parseAssignmentListParams(
  raw: RawSearchParams,
): ParsedAssignmentListParams {
  const ignored: string[] = [];
  const query: AssignmentsPageQuery = { ...parsePageAndLimit(raw, ignored) };

  const active = readSingleParam(raw, 'active', ignored);
  if (active === 'true') query.active = true;
  else if (active === 'false') query.active = false;
  else if (active !== undefined && active !== '') ignored.push('active');

  return { query, ignored, hasFilters: query.active !== undefined };
}

/** Search params for a list link, leaving out the defaults and empty filters. */
export function assignmentListParams(
  query: Partial<AssignmentsPageQuery>,
): Record<string, string | number | undefined> {
  return {
    active: query.active === undefined ? undefined : String(query.active),
    limit: query.limit === DEFAULT_LIMIT ? undefined : query.limit,
    page: query.page === 1 ? undefined : query.page,
  };
}

export function assignmentListHref(
  query: Partial<AssignmentsPageQuery>,
  overrides: Partial<AssignmentsPageQuery> = {},
): string {
  return buildHref(
    '/assignments',
    assignmentListParams({ ...query, ...overrides }),
  );
}
