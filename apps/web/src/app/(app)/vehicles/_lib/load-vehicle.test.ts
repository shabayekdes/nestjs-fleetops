import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getVehicle = vi.hoisted(() => vi.fn());
vi.mock('./vehicles-api', () => ({ getVehicle }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import { loadVehicle } from './load-vehicle';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

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
  getVehicle.mockReset();
});

describe('loadVehicle', () => {
  it('returns the vehicle', async () => {
    getVehicle.mockResolvedValue({ id: ID });
    expect(await loadVehicle(ID)).toEqual({
      kind: 'ok',
      vehicle: { id: ID },
    });
    expect(getVehicle).toHaveBeenCalledWith(ID);
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getVehicle.mockRejectedValue(apiError(status));
    await expect(loadVehicle(ID)).rejects.toThrow('NOT_FOUND');
  });

  it('reports a 403 as forbidden', async () => {
    getVehicle.mockRejectedValue(apiError(403));
    expect(await loadVehicle(ID)).toEqual({ kind: 'forbidden' });
  });

  it('rethrows a 500 and other errors', async () => {
    getVehicle.mockRejectedValueOnce(apiError(500));
    await expect(loadVehicle(ID)).rejects.toBeInstanceOf(ApiError);
    getVehicle.mockRejectedValueOnce(new Error('boom'));
    await expect(loadVehicle(ID)).rejects.toThrow('boom');
  });
});
