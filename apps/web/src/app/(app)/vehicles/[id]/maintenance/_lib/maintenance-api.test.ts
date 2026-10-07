import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import {
  getMaintenanceRecord,
  listMaintenanceRecords,
} from './maintenance-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('listMaintenanceRecords', () => {
  it('encodes the vehicle id and passes the query through', async () => {
    const query = { page: 2, limit: 20, type: 'TIRES' as const };
    await listMaintenanceRecords('a/b?c', query);
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/vehicles/a%2Fb%3Fc/maintenance-records',
      { query },
    );
  });
});

describe('getMaintenanceRecord', () => {
  it('encodes both ids in the path', async () => {
    await getMaintenanceRecord('v/1', 'r?2');
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/vehicles/v%2F1/maintenance-records/r%3F2',
    );
  });
});
