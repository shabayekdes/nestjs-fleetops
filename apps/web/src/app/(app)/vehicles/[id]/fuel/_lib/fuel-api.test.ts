import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getFuelLog, listFuelLogs } from './fuel-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('listFuelLogs', () => {
  it('encodes the vehicle id and passes the query through', async () => {
    const query = { page: 2, limit: 20, from: '2026-01-01' };
    await listFuelLogs('a/b?c', query);
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/vehicles/a%2Fb%3Fc/fuel-logs',
      { query },
    );
  });
});

describe('getFuelLog', () => {
  it('encodes both ids in the path', async () => {
    await getFuelLog('v/1', 'r?2');
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/vehicles/v%2F1/fuel-logs/r%3F2',
    );
  });
});
