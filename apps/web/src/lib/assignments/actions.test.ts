import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';

const sessionApiRequest = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));
vi.mock('next/cache', () => ({ revalidatePath, refresh }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  assignDriverToVehicle,
  assignVehicleToDriver,
  endAssignment,
} from './actions';

const V = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const D = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const OUT_OF_DATE = 'This form is out of date. Reload the page and try again.';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

function apiError(status: number, message = 'API message') {
  return new ApiError({
    status,
    error: 'E',
    message,
    fieldErrors: {},
    requestId: 'r',
    path: '/p',
    body: undefined,
  });
}

beforeEach(() => {
  sessionApiRequest.mockReset();
  revalidatePath.mockReset();
  refresh.mockReset();
});

describe.each([
  {
    name: 'assignDriverToVehicle',
    run: (bound: string, fd: FormData) =>
      assignDriverToVehicle(bound, { values: {} }, fd),
    bound: V,
    field: 'driverId',
    picked: D,
    origin: `/vehicles/${V}`,
    chooseMessage: 'Choose a driver',
  },
  {
    name: 'assignVehicleToDriver',
    run: (bound: string, fd: FormData) =>
      assignVehicleToDriver(bound, { values: {} }, fd),
    bound: D,
    field: 'vehicleId',
    picked: V,
    origin: `/drivers/${D}`,
    chooseMessage: 'Choose a vehicle',
  },
])('$name', ({ run, bound, field, picked, origin, chooseMessage }) => {
  it('posts the ids, revalidates and redirects with the flash', async () => {
    sessionApiRequest.mockResolvedValue({ id: A });
    await expect(run(bound, form({ [field]: picked }))).rejects.toThrow(
      `REDIRECT:${origin}?notice=assignment-created`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith('/assignments', {
      method: 'POST',
      mode: 'action',
      body: { vehicleId: V, driverId: D },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('gives a field error and makes no call for a missing or bad choice', async () => {
    for (const value of [undefined, '', 'nope']) {
      const state = await run(
        bound,
        value === undefined ? form({}) : form({ [field]: value }),
      );
      expect(state.fieldErrors).toEqual({ [field]: [chooseMessage] });
    }
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('reports an out-of-date form for a bad bound id', async () => {
    const state = await run('nope', form({ [field]: picked }));
    expect(state.formError).toBe(OUT_OF_DATE);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('shows the expired-license 422 at form level, exactly', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(422, 'Driver license has expired'),
    );
    const state = await run(bound, form({ [field]: picked }));
    expect(state.formError).toBe('Driver license has expired');
    expect(state.values[field as 'driverId']).toBe(picked);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('shows the API message for a 409', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(409, 'Vehicle already has an active assignment'),
    );
    expect((await run(bound, form({ [field]: picked }))).formError).toBe(
      'Vehicle already has an active assignment',
    );
  });

  it('maps 404, 403 and 5xx', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    expect((await run(bound, form({ [field]: picked }))).formError).toBe(
      'This vehicle or driver no longer exists.',
    );
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect((await run(bound, form({ [field]: picked }))).formError).toBe(
      'You are not allowed to do this.',
    );
    expect(refresh).toHaveBeenCalled();
    sessionApiRequest.mockRejectedValueOnce(apiError(500));
    expect((await run(bound, form({ [field]: picked }))).formError).toMatch(
      /service is unavailable/,
    );
    sessionApiRequest.mockRejectedValueOnce(new ApiConnectionError('timeout'));
    expect((await run(bound, form({ [field]: picked }))).formError).toMatch(
      /service is unavailable/,
    );
  });
});

describe('endAssignment', () => {
  it.each([
    ['vehicle', `/vehicles/${V}`],
    ['driver', `/drivers/${D}`],
  ] as const)('ends it and returns to the %s page', async (returnTo, path) => {
    sessionApiRequest.mockResolvedValue({});
    await expect(endAssignment(A, V, D, returnTo)).rejects.toThrow(
      `REDIRECT:${path}?notice=assignment-ended`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`/assignments/${A}/end`, {
      method: 'POST',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects bad ids and a bad returnTo without a request', async () => {
    for (const args of [
      ['x', V, D, 'vehicle'],
      [A, 'x', D, 'vehicle'],
      [A, V, 'x', 'driver'],
      [A, V, D, '/evil'],
    ] as const) {
      expect(
        await endAssignment(args[0], args[1], args[2], args[3] as 'vehicle'),
      ).toEqual({ error: OUT_OF_DATE });
    }
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns the API message on a 409 and a fixed message on a 404', async () => {
    sessionApiRequest.mockRejectedValueOnce(
      apiError(409, 'Assignment has already ended'),
    );
    expect(await endAssignment(A, V, D, 'vehicle')).toEqual({
      error: 'Assignment has already ended',
    });
    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    expect(await endAssignment(A, V, D, 'vehicle')).toEqual({
      error: 'This assignment no longer exists.',
    });
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect((await endAssignment(A, V, D, 'vehicle')).error).toBe(
      'You are not allowed to do this.',
    );
  });
});
