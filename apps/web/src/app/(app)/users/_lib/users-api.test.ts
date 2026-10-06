import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getUser, listUsers } from './users-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('users api', () => {
  it('lists with the query', async () => {
    await listUsers({ page: 2, limit: 5, role: 'DRIVER' });
    expect(sessionApiRequest).toHaveBeenCalledWith('/users', {
      query: { page: 2, limit: 5, role: 'DRIVER' },
    });
  });

  it('encodes the id', async () => {
    await getUser('a/b');
    expect(sessionApiRequest).toHaveBeenCalledWith('/users/a%2Fb');
  });
});
