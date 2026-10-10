import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import {
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
} from './master-data-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({ data: [], meta: {} });
});

describe('master data api', () => {
  it('lists active makes with the maximum page size', async () => {
    await listVehicleMakes();
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/master-data/vehicle-makes',
      { query: { limit: 100, includeInactive: undefined }, mode: undefined },
    );
  });

  it('can include retired makes', async () => {
    await listVehicleMakes({ includeInactive: true });
    expect(sessionApiRequest.mock.calls[0]?.[1]).toMatchObject({
      query: { limit: 100, includeInactive: true },
    });
  });

  it('encodes the make id and passes the mode for models', async () => {
    await listVehicleModels('a/b', { includeInactive: true, mode: 'action' });
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/master-data/vehicle-makes/a%2Fb/models',
      { query: { limit: 100, includeInactive: true }, mode: 'action' },
    );
  });

  it('lists vehicle types', async () => {
    await listVehicleTypes({ includeInactive: true });
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/master-data/vehicle-types',
      { query: { limit: 100, includeInactive: true }, mode: undefined },
    );
  });
});
