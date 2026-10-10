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
  createVehicle,
  deleteVehicle,
  loadVehicleModelOptions,
  updateVehicle,
} from './actions';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const MAKE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const MODEL_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const TYPE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';
const OTHER_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a04';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  makeId: ` ${MAKE_ID} `,
  modelId: MODEL_ID,
  vehicleTypeId: TYPE_ID,
  year: '2022',
  vin: '1ftbw3xm5pka00001',
  licensePlate: ' ab-123 ',
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
});

describe('createVehicle', () => {
  it('returns field errors and makes no API call on invalid input', async () => {
    const state = await createVehicle(
      { values: {} },
      form({ ...good, makeId: '', vin: 'short' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.makeId).toEqual(['Choose a make']);
    expect(state.fieldErrors?.vin).toEqual(['VIN must be 17 characters']);
    expect(state.values.vin).toBe('short');
  });

  it('sends a normalized body with a numeric year', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(createVehicle({ values: {} }, form(good))).rejects.toThrow(
      `REDIRECT:/vehicles/${ID}?notice=vehicle-created`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith('/vehicles', {
      method: 'POST',
      mode: 'action',
      body: {
        makeId: MAKE_ID,
        modelId: MODEL_ID,
        vehicleTypeId: TYPE_ID,
        year: 2022,
        vin: '1FTBW3XM5PKA00001',
        licensePlate: 'AB-123',
      },
    });
  });

  it('leaves the plate out when it is empty', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      createVehicle({ values: {} }, form({ ...good, licensePlate: '  ' })),
    ).rejects.toThrow('REDIRECT:');
    const body = sessionApiRequest.mock.calls[0]?.[1].body;
    expect(body).not.toHaveProperty('licensePlate');
  });

  it('revalidates before it redirects', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(createVehicle({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('maps a 400 to field errors and echoes the values', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', { vin: ['bad vin'] }),
    );
    const state = await createVehicle({ values: {} }, form(good));
    expect(state.fieldErrors).toEqual({ vin: ['bad vin'] });
    expect(state.values.makeId).toBe(` ${MAKE_ID} `);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('shows the API message for a 409', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(409, 'A vehicle with this VIN already exists'),
    );
    const state = await createVehicle({ values: {} }, form(good));
    expect(state.formError).toBe('A vehicle with this VIN already exists');
  });

  it('maps 403 and 5xx', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect((await createVehicle({ values: {} }, form(good))).formError).toBe(
      'You are not allowed to do this.',
    );
    sessionApiRequest.mockRejectedValueOnce(apiError(500));
    expect((await createVehicle({ values: {} }, form(good))).formError).toMatch(
      /service is unavailable/,
    );
    sessionApiRequest.mockRejectedValueOnce(new ApiConnectionError('timeout'));
    expect((await createVehicle({ values: {} }, form(good))).formError).toMatch(
      /service is unavailable/,
    );
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(createVehicle({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:/login',
    );
  });
});

describe('updateVehicle', () => {
  const original = {
    makeId: MAKE_ID,
    modelId: MODEL_ID,
    vehicleTypeId: TYPE_ID,
    year: 2022,
    vin: '1FTBW3XM5PKA00001',
    licensePlate: 'AB-123' as string | null,
  };
  const same = {
    makeId: MAKE_ID,
    modelId: MODEL_ID,
    vehicleTypeId: TYPE_ID,
    year: '2022',
    vin: '1FTBW3XM5PKA00001',
    licensePlate: 'AB-123',
  };
  const outOfDate = 'This form is out of date. Reload the page and try again.';

  it.each([null, undefined, 'text'])(
    'reports an out-of-date form when the bound original is %s',
    async (bad) => {
      const state = await updateVehicle(
        ID,
        bad as unknown as typeof original,
        { values: {} },
        form(good),
      );
      expect(state.formError).toBe(outOfDate);
      expect(sessionApiRequest).not.toHaveBeenCalled();
    },
  );

  it('reports an out-of-date form for a bad id', async () => {
    const state = await updateVehicle(
      'nope',
      original,
      { values: {} },
      form(same),
    );
    expect(state.formError).toBe(outOfDate);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('reports an out-of-date form for a bad original', async () => {
    const state = await updateVehicle(
      ID,
      { ...original, vin: 'short' },
      { values: {} },
      form(same),
    );
    expect(state.formError).toBe(outOfDate);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns field errors for invalid input', async () => {
    const state = await updateVehicle(
      ID,
      original,
      { values: {} },
      form({ ...same, makeId: '' }),
    );
    expect(state.fieldErrors?.makeId).toEqual(['Choose a make']);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('redirects without a call when nothing changed', async () => {
    await expect(
      updateVehicle(
        ID,
        original,
        { values: {} },
        form({
          ...same,
          makeId: ` ${MAKE_ID} `,
          vin: same.vin.toLowerCase(),
        }),
      ),
    ).rejects.toThrow(`REDIRECT:/vehicles/${ID}`);
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('sends only the changed keys', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      updateVehicle(
        ID,
        original,
        { values: {} },
        form({ ...same, vehicleTypeId: OTHER_ID, year: '2023' }),
      ),
    ).rejects.toThrow(`REDIRECT:/vehicles/${ID}?notice=vehicle-updated`);
    expect(sessionApiRequest).toHaveBeenCalledWith(`/vehicles/${ID}`, {
      method: 'PATCH',
      mode: 'action',
      body: { vehicleTypeId: OTHER_ID, year: 2023 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('sends the model with a changed make', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      updateVehicle(
        ID,
        original,
        { values: {} },
        form({ ...same, makeId: OTHER_ID }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      makeId: OTHER_ID,
      modelId: MODEL_ID,
    });
  });

  it('shows a catalog 422 as a form error', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(422, 'Vehicle model is retired'),
    );
    const state = await updateVehicle(
      ID,
      original,
      { values: {} },
      form({ ...same, modelId: OTHER_ID }),
    );
    expect(state.formError).toBe('Vehicle model is retired');
  });

  it('sends null for a cleared plate', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      updateVehicle(
        ID,
        original,
        { values: {} },
        form({ ...same, licensePlate: '' }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      licensePlate: null,
    });
  });

  it('treats a null original plate as empty', async () => {
    await expect(
      updateVehicle(
        ID,
        { ...original, licensePlate: null },
        { values: {} },
        form({ ...same, licensePlate: '' }),
      ),
    ).rejects.toThrow(`REDIRECT:/vehicles/${ID}`);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it.each([
    [404, undefined, 'This vehicle no longer exists.'],
    [
      409,
      'A vehicle with this license plate already exists',
      'A vehicle with this license plate already exists',
    ],
    [403, undefined, 'You are not allowed to do this.'],
  ])('maps a %i', async (status, message, expected) => {
    sessionApiRequest.mockRejectedValue(apiError(status, message));
    const state = await updateVehicle(
      ID,
      original,
      { values: {} },
      form({ ...same, modelId: OTHER_ID }),
    );
    expect(state.formError).toBe(expected);
    expect(state.values.modelId).toBe(OTHER_ID);
  });
});

describe('deleteVehicle', () => {
  it('rejects an invalid id without a call', async () => {
    expect(await deleteVehicle('../users')).toEqual({
      error: 'Vehicle not found.',
    });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('revalidates and redirects on success', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(deleteVehicle(ID)).rejects.toThrow(
      'REDIRECT:/vehicles?notice=vehicle-deleted',
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`/vehicles/${ID}`, {
      method: 'DELETE',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it.each([
    [404, 'x', 'This vehicle was not found. It may already have been deleted.'],
    [
      409,
      'Vehicle has related records and cannot be deleted',
      'Vehicle has related records and cannot be deleted',
    ],
    [403, 'x', 'You are not allowed to do this.'],
    [500, 'x', 'The service is unavailable. Please try again shortly.'],
  ])(
    'returns an error for %i and never throws',
    async (status, message, expected) => {
      sessionApiRequest.mockRejectedValue(apiError(status, message));
      expect(await deleteVehicle(ID)).toEqual({ error: expected });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe('loadVehicleModelOptions', () => {
  it('rejects an invalid make id without a call', async () => {
    expect(await loadVehicleModelOptions('../x', false)).toEqual({
      error: 'Choose a valid make.',
    });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns id and name pairs, calling the API in action mode', async () => {
    sessionApiRequest.mockResolvedValue({
      data: [{ id: MODEL_ID, name: 'Corolla', slug: 'corolla', active: true }],
      meta: { page: 1, limit: 100, total: 1 },
    });
    expect(await loadVehicleModelOptions(MAKE_ID, true)).toEqual({
      options: [{ id: MODEL_ID, name: 'Corolla' }],
    });
    expect(sessionApiRequest).toHaveBeenCalledWith(
      `/master-data/vehicle-makes/${MAKE_ID}/models`,
      { query: { limit: 100, includeInactive: true }, mode: 'action' },
    );
  });

  it('requests active models only by default', async () => {
    sessionApiRequest.mockResolvedValue({ data: [], meta: {} });
    expect(await loadVehicleModelOptions(MAKE_ID, false)).toEqual({
      options: [],
    });
    expect(sessionApiRequest.mock.calls[0]?.[1].query).toEqual({
      limit: 100,
      includeInactive: undefined,
    });
  });

  it.each([
    [404, 'This make no longer exists.'],
    [403, 'You are not allowed to do this.'],
    [500, 'The service is unavailable. Please try again shortly.'],
  ])('returns an error for %i', async (status, expected) => {
    sessionApiRequest.mockRejectedValue(apiError(status));
    expect(await loadVehicleModelOptions(MAKE_ID, false)).toEqual({
      error: expected,
    });
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(loadVehicleModelOptions(MAKE_ID, false)).rejects.toThrow(
      'REDIRECT:/login',
    );
  });
});
