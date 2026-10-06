import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listLinkableUsers = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('./drivers-api', () => ({ listLinkableUsers }));

import {
  CURRENT_LINKED_LABEL,
  buildUserOptions,
  loadUserPicker,
} from './user-options';

const user = {
  id: 'u1',
  firstName: 'Sam',
  lastName: 'Driver',
  email: 'sam@x.test',
  role: 'DRIVER' as const,
};

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'r',
    path: '/p',
    body: undefined,
  });
}

beforeEach(() => {
  listLinkableUsers.mockReset();
});

describe('buildUserOptions', () => {
  it('labels users with name, email and role', () => {
    expect(buildUserOptions([user] as never)).toEqual([
      { id: 'u1', label: 'Sam Driver (sam@x.test) — Driver' },
    ]);
  });

  it('adds the current linked account when it is not listed', () => {
    expect(buildUserOptions([user] as never, 'other')[0]).toEqual({
      id: 'other',
      label: CURRENT_LINKED_LABEL,
    });
    expect(buildUserOptions([user] as never, 'u1')).toHaveLength(1);
  });
});

describe('loadUserPicker', () => {
  it('makes no users call for a manager or a driver', async () => {
    expect(await loadUserPicker('MANAGER')).toEqual({ truncated: false });
    expect(await loadUserPicker('DRIVER')).toEqual({ truncated: false });
    expect(listLinkableUsers).not.toHaveBeenCalled();
  });

  it('returns options for an admin', async () => {
    listLinkableUsers.mockResolvedValue({ data: [user], truncated: true });
    const picker = await loadUserPicker('ADMIN');
    expect(picker.options).toHaveLength(1);
    expect(picker.truncated).toBe(true);
  });

  it('leaves the picker out on a 403 and rethrows other errors', async () => {
    listLinkableUsers.mockRejectedValueOnce(apiError(403));
    expect(await loadUserPicker('ADMIN')).toEqual({ truncated: false });
    listLinkableUsers.mockRejectedValueOnce(apiError(500));
    await expect(loadUserPicker('ADMIN')).rejects.toBeInstanceOf(ApiError);
  });
});
