import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getVehicle, listVehicles } from './vehicles-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('listVehicles', () => {
  it('passes the query through to the API client', async () => {
    const query = { page: 2, limit: 20, make: 'Ford', year: 2022 };
    await listVehicles(query);
    expect(sessionApiRequest).toHaveBeenCalledWith('/vehicles', { query });
  });
});

describe('getVehicle', () => {
  it('encodes the id in the path', async () => {
    await getVehicle('a/b?c');
    expect(sessionApiRequest).toHaveBeenCalledWith('/vehicles/a%2Fb%3Fc');
  });
});
