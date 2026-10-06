import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getDriver, listDrivers, listLinkableUsers } from './drivers-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('drivers api', () => {
  it('passes the list query through', async () => {
    await listDrivers({ page: 2, limit: 5 });
    expect(sessionApiRequest).toHaveBeenCalledWith('/drivers', {
      query: { page: 2, limit: 5 },
    });
  });

  it('encodes the id', async () => {
    await getDriver('a/b?c');
    expect(sessionApiRequest).toHaveBeenCalledWith('/drivers/a%2Fb%3Fc');
  });

  it('lists up to 100 users and flags a truncated list', async () => {
    sessionApiRequest.mockResolvedValue({
      data: [{ id: 'u' }],
      meta: { page: 1, limit: 100, total: 101 },
    });
    const result = await listLinkableUsers();
    expect(sessionApiRequest).toHaveBeenCalledWith('/users', {
      query: { limit: 100 },
    });
    expect(result).toEqual({ data: [{ id: 'u' }], truncated: true });

    sessionApiRequest.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 100 },
    });
    expect((await listLinkableUsers()).truncated).toBe(false);
  });
});
