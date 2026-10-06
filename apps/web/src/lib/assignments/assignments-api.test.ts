import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import {
  listAssignableDrivers,
  listAssignableVehicles,
  listAssignments,
  loadAssignmentSection,
} from './assignments-api';

const V = 'vehicle-id';
const empty = { data: [], meta: { page: 1, limit: 10, total: 0 } };
const assignment = { id: 'a1', endedAt: null };

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

function respond(
  handler: (path: string, query: Record<string, unknown>) => unknown,
) {
  sessionApiRequest.mockImplementation(
    async (path: string, options: { query?: Record<string, unknown> }) =>
      handler(path, options?.query ?? {}),
  );
}

beforeEach(() => {
  sessionApiRequest.mockReset();
});

describe('listAssignments', () => {
  it('passes the query through', async () => {
    sessionApiRequest.mockResolvedValue(empty);
    await listAssignments({ page: 2, limit: 5, active: false });
    expect(sessionApiRequest).toHaveBeenCalledWith('/assignments', {
      query: { page: 2, limit: 5, active: false },
    });
  });
});

describe('pickers', () => {
  it('request 100 and flag truncation', async () => {
    sessionApiRequest.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 101 },
    });
    expect((await listAssignableDrivers()).truncated).toBe(true);
    expect(sessionApiRequest).toHaveBeenLastCalledWith('/drivers', {
      query: { limit: 100 },
    });
    sessionApiRequest.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 100 },
    });
    expect((await listAssignableVehicles()).truncated).toBe(false);
    expect(sessionApiRequest).toHaveBeenLastCalledWith('/vehicles', {
      query: { limit: 100 },
    });
  });
});

describe('loadAssignmentSection', () => {
  it('asks for the current (limit 1) and the past page (limit 10)', async () => {
    respond((path, query) =>
      path === '/assignments'
        ? query.active === true
          ? { data: [assignment], meta: { page: 1, limit: 1, total: 1 } }
          : empty
        : { data: [], meta: { total: 0 } },
    );
    const result = await loadAssignmentSection({ vehicleId: V }, 3, {
      withOptions: true,
    });
    expect(sessionApiRequest).toHaveBeenCalledWith('/assignments', {
      query: { vehicleId: V, active: true, page: 1, limit: 1 },
    });
    expect(sessionApiRequest).toHaveBeenCalledWith('/assignments', {
      query: { vehicleId: V, active: false, page: 3, limit: 10 },
    });
    expect(result).toMatchObject({ kind: 'ok', current: assignment });
  });

  it('does not fetch options when there is a current assignment', async () => {
    respond((_path, query) =>
      query.active === true
        ? { data: [assignment], meta: { page: 1, limit: 1, total: 1 } }
        : empty,
    );
    await loadAssignmentSection({ driverId: 'd' }, 1, { withOptions: true });
    const paths = sessionApiRequest.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(['/assignments', '/assignments']);
  });

  it('fetches driver options for a vehicle and vehicle options for a driver', async () => {
    respond((path) =>
      path === '/assignments'
        ? empty
        : { data: [], meta: { page: 1, limit: 100, total: 0 } },
    );
    const forVehicle = await loadAssignmentSection({ vehicleId: V }, 1, {
      withOptions: true,
    });
    expect(forVehicle).toMatchObject({ driverOptions: { truncated: false } });
    expect(sessionApiRequest.mock.calls.map((c) => c[0])).toContain('/drivers');

    sessionApiRequest.mockClear();
    const forDriver = await loadAssignmentSection({ driverId: 'd' }, 1, {
      withOptions: true,
    });
    expect(forDriver).toMatchObject({ vehicleOptions: { truncated: false } });
    expect(sessionApiRequest.mock.calls.map((c) => c[0])).toContain(
      '/vehicles',
    );
  });

  it('skips options when withOptions is false', async () => {
    respond(() => empty);
    await loadAssignmentSection({ vehicleId: V }, 1, { withOptions: false });
    expect(sessionApiRequest).toHaveBeenCalledTimes(2);
  });

  it('turns a 403 into forbidden and rethrows other errors', async () => {
    sessionApiRequest.mockRejectedValue(apiError(403));
    expect(
      await loadAssignmentSection({ vehicleId: V }, 1, { withOptions: true }),
    ).toEqual({ kind: 'forbidden' });
  });

  it('rethrows other API errors', async () => {
    sessionApiRequest.mockRejectedValue(apiError(500));
    await expect(
      loadAssignmentSection({ vehicleId: V }, 1, { withOptions: true }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rethrows connection errors', async () => {
    sessionApiRequest.mockRejectedValue(new ApiConnectionError('timeout'));
    await expect(
      loadAssignmentSection({ vehicleId: V }, 1, { withOptions: true }),
    ).rejects.toBeInstanceOf(ApiConnectionError);
  });
});
