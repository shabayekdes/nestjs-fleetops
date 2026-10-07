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

import { createFuelLog, deleteFuelLog, updateFuelLog } from './actions';

const VID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const RID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const LIST = `/vehicles/${VID}/fuel`;
const LOGS = `/vehicles/${VID}/fuel-logs`;
const NOT_ALLOWED = 'You are not allowed to do this.';
const UNAVAILABLE = /service is unavailable/;
const OUT_OF_DATE = 'This form is out of date. Reload the page and try again.';
const NOT_FOUND = 'This vehicle or fuel log no longer exists.';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  fueledOn: '2026-01-15',
  liters: '45.500',
  totalCost: '80.00',
  odometerKm: '',
};

function apiError(
  status: number,
  message = 'API message',
  fieldErrors: Record<string, string[]> = {},
) {
  return new ApiError({
    status,
    error: 'E',
    message,
    fieldErrors,
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

describe('createFuelLog', () => {
  it('returns field errors and echoes values without an API call', async () => {
    const state = await createFuelLog(
      VID,
      { values: {} },
      form({ ...good, liters: '0', totalCost: 'abc' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.liters).toEqual(['Enter more than 0 liters']);
    expect(state.fieldErrors?.totalCost).toEqual([
      'Enter an amount such as 80.00',
    ]);
    expect(state.values.totalCost).toBe('abc');
  });

  it('reports an out-of-date form for a bad vehicle id', async () => {
    const state = await createFuelLog('../x', { values: {} }, form(good));
    expect(state.formError).toBe(OUT_OF_DATE);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('leaves an empty odometer out of the body', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      createFuelLog(VID, { values: {} }, form(good)),
    ).rejects.toThrow(`REDIRECT:${LIST}?notice=fuel-log-created`);
    expect(sessionApiRequest).toHaveBeenCalledWith(LOGS, {
      method: 'POST',
      mode: 'action',
      body: { fueledOn: '2026-01-15', liters: '45.500', totalCost: '80.00' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('sends a numeric odometer', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      createFuelLog(VID, { values: {} }, form({ ...good, odometerKm: '5000' })),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body.odometerKm).toBe(5000);
  });

  it('maps a 400 with details to fields and echoes values', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', { liters: ['too many liters'] }),
    );
    const state = await createFuelLog(VID, { values: {} }, form(good));
    expect(state.fieldErrors).toEqual({ liters: ['too many liters'] });
    expect(state.values.fueledOn).toBe('2026-01-15');
  });

  it('shows a 400 without details as a form-level error', async () => {
    sessionApiRequest.mockRejectedValue(apiError(400, 'Something is off'));
    const state = await createFuelLog(VID, { values: {} }, form(good));
    expect(state.formError).toBe('Something is off');
    expect(state.fieldErrors).toBeUndefined();
  });

  it('maps 403 (and refreshes), 404 and 5xx', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect(
      (await createFuelLog(VID, { values: {} }, form(good))).formError,
    ).toBe(NOT_ALLOWED);
    expect(refresh).toHaveBeenCalled();
    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    expect(
      (await createFuelLog(VID, { values: {} }, form(good))).formError,
    ).toBe(NOT_FOUND);
    sessionApiRequest.mockRejectedValueOnce(apiError(502));
    expect(
      (await createFuelLog(VID, { values: {} }, form(good))).formError,
    ).toMatch(UNAVAILABLE);
    sessionApiRequest.mockRejectedValueOnce(new ApiConnectionError('timeout'));
    expect(
      (await createFuelLog(VID, { values: {} }, form(good))).formError,
    ).toMatch(UNAVAILABLE);
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(
      createFuelLog(VID, { values: {} }, form(good)),
    ).rejects.toThrow('REDIRECT:/login');
  });
});

describe('updateFuelLog', () => {
  const original = {
    fueledOn: '2026-01-15',
    liters: '45.500',
    totalCost: '80.00',
    odometerKm: 1000 as number | null,
  };
  const same = {
    fueledOn: '2026-01-15',
    liters: '45.500',
    totalCost: '80.00',
    odometerKm: '1000',
  };

  function update(
    fields: Record<string, string>,
    o?: unknown,
    ids: [string, string] = [VID, RID],
  ) {
    const bound = arguments.length >= 2 ? o : original;
    return updateFuelLog(
      ids[0],
      ids[1],
      bound as typeof original,
      { values: {} },
      form(fields),
    );
  }

  it.each([null, undefined, 'text'])(
    'reports an out-of-date form when the bound original is %s',
    async (bad) => {
      expect((await update(same, bad)).formError).toBe(OUT_OF_DATE);
      expect(sessionApiRequest).not.toHaveBeenCalled();
    },
  );

  it('reports an out-of-date form for a tampered original and bad ids', async () => {
    expect((await update(same, { ...original, liters: '0' })).formError).toBe(
      OUT_OF_DATE,
    );
    expect((await update(same, original, ['nope', RID])).formError).toBe(
      OUT_OF_DATE,
    );
    expect((await update(same, original, [VID, 'nope'])).formError).toBe(
      OUT_OF_DATE,
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns field errors for invalid input without a call', async () => {
    const state = await update({ ...same, liters: '0' });
    expect(state.fieldErrors?.liters).toEqual(['Enter more than 0 liters']);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('redirects without a call when nothing changed (45.5 equals 45.500)', async () => {
    await expect(
      update({ ...same, liters: '45.5', totalCost: '80' }),
    ).rejects.toThrow(`REDIRECT:${LIST}`);
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('sends only the changed fields', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(update({ ...same, liters: '50' })).rejects.toThrow(
      `REDIRECT:${LIST}?notice=fuel-log-updated`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`${LOGS}/${RID}`, {
      method: 'PATCH',
      mode: 'action',
      body: { liters: '50' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('sends null for a cleared odometer', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(update({ ...same, odometerKm: '' })).rejects.toThrow(
      'REDIRECT:',
    );
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      odometerKm: null,
    });
  });

  it.each([
    [404, 'x', NOT_FOUND],
    [403, 'x', NOT_ALLOWED],
    [409, 'Conflict text', 'Conflict text'],
  ])('maps a %i', async (status, message, expected) => {
    sessionApiRequest.mockRejectedValue(apiError(status, message));
    const state = await update({ ...same, liters: '50' });
    expect(state.formError).toBe(expected);
    expect(state.values.liters).toBe('50');
  });

  it('maps a 5xx to service unavailable', async () => {
    sessionApiRequest.mockRejectedValue(apiError(500));
    expect((await update({ ...same, liters: '50' })).formError).toMatch(
      UNAVAILABLE,
    );
  });
});

describe('deleteFuelLog', () => {
  it('rejects invalid ids without a call', async () => {
    expect(await deleteFuelLog('../x', RID)).toEqual({
      error: 'Fuel log not found.',
    });
    expect(await deleteFuelLog(VID, 'nope')).toEqual({
      error: 'Fuel log not found.',
    });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('revalidates and redirects to the unfiltered list on success', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(deleteFuelLog(VID, RID)).rejects.toThrow(
      `REDIRECT:${LIST}?notice=fuel-log-deleted`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`${LOGS}/${RID}`, {
      method: 'DELETE',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it.each([
    [
      404,
      'x',
      'This fuel log was not found. It may already have been deleted.',
    ],
    [403, 'x', NOT_ALLOWED],
    [409, 'Cannot delete', 'Cannot delete'],
  ])(
    'returns an error for %i and never throws',
    async (status, message, expected) => {
      sessionApiRequest.mockRejectedValue(apiError(status, message));
      expect(await deleteFuelLog(VID, RID)).toEqual({ error: expected });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('returns service unavailable for a 5xx', async () => {
    sessionApiRequest.mockRejectedValue(apiError(500));
    expect((await deleteFuelLog(VID, RID)).error).toMatch(UNAVAILABLE);
  });
});
