import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getFleetDashboard, getMyDashboard } from './dashboard-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('dashboard API', () => {
  it('getFleetDashboard calls /dashboard/fleet', async () => {
    await getFleetDashboard();
    expect(sessionApiRequest).toHaveBeenCalledWith('/dashboard/fleet');
  });

  it('getMyDashboard calls /dashboard/me', async () => {
    await getMyDashboard();
    expect(sessionApiRequest).toHaveBeenCalledWith('/dashboard/me');
  });
});
