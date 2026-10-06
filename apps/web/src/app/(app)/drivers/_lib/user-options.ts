import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { Role, User } from '@/lib/api/types';
import { formatRole } from '@/lib/auth/roles';
import type { UserOption } from '../_components/driver-form';
import { listLinkableUsers } from './drivers-api';

export const CURRENT_LINKED_LABEL = 'Current linked account';

/** "First Last (email) — Role", plus the current account when it is not listed. */
export function buildUserOptions(
  users: User[],
  currentUserId: string | null = null,
): UserOption[] {
  const options = users.map((user) => ({
    id: user.id,
    label: `${user.firstName} ${user.lastName} (${user.email}) — ${formatRole(user.role)}`,
  }));
  if (currentUserId && !users.some((user) => user.id === currentUserId)) {
    options.unshift({ id: currentUserId, label: CURRENT_LINKED_LABEL });
  }
  return options;
}

/**
 * The login account picker data. Only an ADMIN can list users, so any other
 * role gets no picker and no `/users` call. A 403 means the picker is left
 * out too; any other error is rethrown.
 */
export async function loadUserPicker(
  role: Role,
  currentUserId: string | null = null,
): Promise<{ options?: UserOption[]; truncated: boolean }> {
  if (role !== 'ADMIN') return { truncated: false };
  try {
    const { data, truncated } = await listLinkableUsers();
    return { options: buildUserOptions(data, currentUserId), truncated };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { truncated: false };
    }
    throw error;
  }
}
