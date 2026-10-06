import 'server-only';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { User, UserList } from '@/lib/api/types';
import type { UserListQuery } from './list-params';

export function listUsers(query: UserListQuery): Promise<UserList> {
  return sessionApiRequest<UserList>('/users', { query });
}

/** The caller must check `isUuid(id)` first. */
export function getUser(id: string): Promise<User> {
  return sessionApiRequest<User>(`/users/${encodeURIComponent(id)}`);
}
