import { parseInteger, readSingleParam } from '@/lib/list-params';
import type { RawSearchParams } from '@/lib/search-params';

/** The history page from `?assignmentsPage=`; an invalid value becomes 1, silently. */
export function parseAssignmentsPage(raw: RawSearchParams): number {
  const value = readSingleParam(raw, 'assignmentsPage', []);
  return parseInteger(value, /^\d+$/, 1, 1_000_000) ?? 1;
}
