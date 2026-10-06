import 'server-only';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { Driver, DriverList, User, UserList } from '@/lib/api/types';
import type { DriverListQuery } from './list-params';

const LINKABLE_USERS_LIMIT = 100;

export function listDrivers(query: DriverListQuery): Promise<DriverList> {
  return sessionApiRequest<DriverList>('/drivers', { query });
}

/** The caller must check `isUuid(id)` first. */
export function getDriver(id: string): Promise<Driver> {
  return sessionApiRequest<Driver>(`/drivers/${encodeURIComponent(id)}`);
}

/**
 * Users a driver can be linked to (any role, newest first, at most 100). The
 * API lets only an ADMIN list users, so call this for an ADMIN only. There is
 * no search (API gap), so `truncated` says the list is incomplete.
 */
export async function listLinkableUsers(): Promise<{
  data: User[];
  truncated: boolean;
}> {
  const result = await sessionApiRequest<UserList>('/users', {
    query: { limit: LINKABLE_USERS_LIMIT },
  });
  return {
    data: result.data,
    truncated: result.meta.total > LINKABLE_USERS_LIMIT,
  };
}
