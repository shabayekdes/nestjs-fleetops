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
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  updateMaintenanceRecord,
} from './actions';

const VID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const RID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const LIST = `/vehicles/${VID}/maintenance`;
const RECORDS = `/vehicles/${VID}/maintenance-records`;
const NOT_ALLOWED = 'You are not allowed to do this.';
const UNAVAILABLE = /service is unavailable/;
const OUT_OF_DATE = 'This form is out of date. Reload the page and try again.';
const NOT_FOUND = 'This vehicle or maintenance record no longer exists.';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  type: 'OIL_CHANGE',
  performedOn: '2026-01-15',
  cost: '89.90',
  odometerKm: '',
  vendor: '',
  description: '',
  nextServiceDueOn: '',
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

describe('createMaintenanceRecord', () => {
  it('returns field errors and echoes values without an API call', async () => {
    const state = await createMaintenanceRecord(
      VID,
      { values: {} },
      form({ ...good, type: '', cost: 'abc' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.type).toEqual(['Choose a type']);
    expect(state.fieldErrors?.cost).toEqual(['Enter an amount such as 89.90']);
    expect(state.values.cost).toBe('abc');
  });

  it('reports an out-of-date form for a bad vehicle id', async () => {
    const state = await createMaintenanceRecord(
      '../users',
      { values: {} },
      form(good),
    );
    expect(state.formError).toBe(OUT_OF_DATE);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('leaves empty optionals out of the body', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      createMaintenanceRecord(VID, { values: {} }, form(good)),
    ).rejects.toThrow(`REDIRECT:${LIST}?notice=maintenance-created`);
    expect(sessionApiRequest).toHaveBeenCalledWith(RECORDS, {
      method: 'POST',
      mode: 'action',
      body: { type: 'OIL_CHANGE', performedOn: '2026-01-15', cost: '89.90' },
    });
  });

  it('sends the optionals that have values, with a numeric odometer', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      createMaintenanceRecord(
        VID,
        { values: {} },
        form({
          ...good,
          odometerKm: '120000',
          vendor: ' Quick Lube ',
          description: 'New filter',
          nextServiceDueOn: '2026-07-15',
        }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      type: 'OIL_CHANGE',
      performedOn: '2026-01-15',
      cost: '89.90',
      odometerKm: 120000,
      vendor: 'Quick Lube',
      description: 'New filter',
      nextServiceDueOn: '2026-07-15',
    });
  });

  it('revalidates before it redirects', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      createMaintenanceRecord(VID, { values: {} }, form(good)),
    ).rejects.toThrow('REDIRECT:');
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('maps a 400 with details to fields and echoes values', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', { cost: ['cost is too large'] }),
    );
    const state = await createMaintenanceRecord(
      VID,
      { values: {} },
      form(good),
    );
    expect(state.fieldErrors).toEqual({ cost: ['cost is too large'] });
    expect(state.values.performedOn).toBe('2026-01-15');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('shows a 400 without details as a form-level error with the API text', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'nextServiceDueOn must be after performedOn'),
    );
    const state = await createMaintenanceRecord(
      VID,
      { values: {} },
      form({ ...good, nextServiceDueOn: '2026-01-01' }),
    );
    expect(state.fieldErrors).toBeUndefined();
    expect(state.formError).toBe('nextServiceDueOn must be after performedOn');
    expect(state.values.nextServiceDueOn).toBe('2026-01-01');
  });

  it('maps 403 (and refreshes), 404 and 5xx', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect(
      (await createMaintenanceRecord(VID, { values: {} }, form(good)))
        .formError,
    ).toBe(NOT_ALLOWED);
    expect(refresh).toHaveBeenCalled();

    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    expect(
      (await createMaintenanceRecord(VID, { values: {} }, form(good)))
        .formError,
    ).toBe(NOT_FOUND);

    sessionApiRequest.mockRejectedValueOnce(apiError(500));
    expect(
      (await createMaintenanceRecord(VID, { values: {} }, form(good)))
        .formError,
    ).toMatch(UNAVAILABLE);

    sessionApiRequest.mockRejectedValueOnce(new ApiConnectionError('timeout'));
    expect(
      (await createMaintenanceRecord(VID, { values: {} }, form(good)))
        .formError,
    ).toMatch(UNAVAILABLE);
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(
      createMaintenanceRecord(VID, { values: {} }, form(good)),
    ).rejects.toThrow('REDIRECT:/login');
  });
});

describe('updateMaintenanceRecord', () => {
  const original = {
    type: 'OIL_CHANGE' as const,
    performedOn: '2026-01-15',
    cost: '89.90',
    odometerKm: 1000 as number | null,
    vendor: 'Quick Lube' as string | null,
    description: null as string | null,
    nextServiceDueOn: null as string | null,
  };
  const same = {
    type: 'OIL_CHANGE',
    performedOn: '2026-01-15',
    cost: '89.90',
    odometerKm: '1000',
    vendor: 'Quick Lube',
    description: '',
    nextServiceDueOn: '',
  };

  function update(
    fields: Record<string, string>,
    o?: unknown,
    ids: [string, string] = [VID, RID],
  ) {
    const bound = arguments.length >= 2 ? o : original;
    return updateMaintenanceRecord(
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

  it('reports an out-of-date form for a tampered original', async () => {
    expect((await update(same, { ...original, cost: 'free' })).formError).toBe(
      OUT_OF_DATE,
    );
    expect((await update(same, { ...original, type: 'X' })).formError).toBe(
      OUT_OF_DATE,
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('reports an out-of-date form for bad ids', async () => {
    expect((await update(same, original, ['nope', RID])).formError).toBe(
      OUT_OF_DATE,
    );
    expect((await update(same, original, [VID, 'nope'])).formError).toBe(
      OUT_OF_DATE,
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns field errors for invalid input without a call', async () => {
    const state = await update({ ...same, cost: '' });
    expect(state.fieldErrors?.cost).toEqual(['Enter an amount such as 89.90']);
    expect(state.values.vendor).toBe('Quick Lube');
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('redirects without a call when nothing changed (89.9 equals 89.90)', async () => {
    await expect(update({ ...same, cost: '89.9' })).rejects.toThrow(
      `REDIRECT:${LIST}`,
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('sends only the changed fields', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      update({ ...same, type: 'BRAKES', cost: '120' }),
    ).rejects.toThrow(`REDIRECT:${LIST}?notice=maintenance-updated`);
    expect(sessionApiRequest).toHaveBeenCalledWith(`${RECORDS}/${RID}`, {
      method: 'PATCH',
      mode: 'action',
      body: { type: 'BRAKES', cost: '120' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it('sends null for cleared optional fields', async () => {
    sessionApiRequest.mockResolvedValue({ id: RID });
    await expect(
      update({ ...same, odometerKm: '', vendor: ' ' }),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      odometerKm: null,
      vendor: null,
    });
  });

  it.each([
    [404, 'x', NOT_FOUND],
    [403, 'x', NOT_ALLOWED],
    [409, 'Conflict text', 'Conflict text'],
    [
      400,
      'nextServiceDueOn must be after performedOn',
      'nextServiceDueOn must be after performedOn',
    ],
  ])('maps a %i', async (status, message, expected) => {
    sessionApiRequest.mockRejectedValue(apiError(status, message));
    const state = await update({ ...same, vendor: 'Other' });
    expect(state.formError).toBe(expected);
    expect(state.values.vendor).toBe('Other');
  });

  it('maps a 5xx and a connection error to service unavailable', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(503));
    expect((await update({ ...same, vendor: 'Other' })).formError).toMatch(
      UNAVAILABLE,
    );
    sessionApiRequest.mockRejectedValueOnce(
      new ApiConnectionError('unreachable'),
    );
    expect((await update({ ...same, vendor: 'Other' })).formError).toMatch(
      UNAVAILABLE,
    );
  });
});

describe('deleteMaintenanceRecord', () => {
  it('rejects invalid ids without a call', async () => {
    expect(await deleteMaintenanceRecord('../x', RID)).toEqual({
      error: 'Maintenance record not found.',
    });
    expect(await deleteMaintenanceRecord(VID, 'nope')).toEqual({
      error: 'Maintenance record not found.',
    });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('revalidates and redirects to the unfiltered list on success', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(deleteMaintenanceRecord(VID, RID)).rejects.toThrow(
      `REDIRECT:${LIST}?notice=maintenance-deleted`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`${RECORDS}/${RID}`, {
      method: 'DELETE',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/vehicles', 'layout');
  });

  it.each([
    [
      404,
      'x',
      'This maintenance record was not found. It may already have been deleted.',
    ],
    [403, 'x', NOT_ALLOWED],
    [409, 'Cannot delete', 'Cannot delete'],
  ])(
    'returns an error for %i and never throws',
    async (status, message, expected) => {
      sessionApiRequest.mockRejectedValue(apiError(status, message));
      expect(await deleteMaintenanceRecord(VID, RID)).toEqual({
        error: expected,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('returns service unavailable for a 5xx', async () => {
    sessionApiRequest.mockRejectedValue(apiError(500));
    const result = await deleteMaintenanceRecord(VID, RID);
    expect(result.error).toMatch(UNAVAILABLE);
  });
});
