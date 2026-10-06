import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

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

import { createDriver, deleteDriver, updateDriver } from './actions';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const UID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const NOT_ALLOWED = 'You are not allowed to do this.';
const OUT_OF_DATE = 'This form is out of date. Reload the page and try again.';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  firstName: ' Ada ',
  lastName: 'Lovelace',
  licenseNumber: ' ab-123 ',
  licenseExpiresOn: '2030-05-20',
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

describe('createDriver', () => {
  it('returns field errors and makes no API call on invalid input', async () => {
    const state = await createDriver(
      { values: {} },
      form({ ...good, firstName: '', licenseExpiresOn: '2024-02-30' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.firstName).toEqual(['Enter a first name']);
    expect(state.fieldErrors?.licenseExpiresOn).toEqual(['Enter a valid date']);
  });

  it('sends a normalized body without userId when not linked', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(createDriver({ values: {} }, form(good))).rejects.toThrow(
      `REDIRECT:/drivers/${ID}?notice=driver-created`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith('/drivers', {
      method: 'POST',
      mode: 'action',
      body: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        licenseNumber: 'AB-123',
        licenseExpiresOn: '2030-05-20',
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('leaves userId out when the select is set to Not linked', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      createDriver({ values: {} }, form({ ...good, userId: '' })),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).not.toHaveProperty(
      'userId',
    );
  });

  it('includes userId when one was chosen', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(
      createDriver({ values: {} }, form({ ...good, userId: UID })),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body.userId).toBe(UID);
  });

  it('maps a 400 on licenseNumber to that field and echoes values', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', { licenseNumber: ['bad license'] }),
    );
    const state = await createDriver({ values: {} }, form(good));
    expect(state.fieldErrors).toEqual({ licenseNumber: ['bad license'] });
    expect(state.values.licenseNumber).toBe(' ab-123 ');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('shows a 409 at form level and keeps the values', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(409, 'A driver with this license number already exists'),
    );
    const state = await createDriver({ values: {} }, form(good));
    expect(state.formError).toBe(
      'A driver with this license number already exists',
    );
    expect(state.values.firstName).toBe(' Ada ');
  });

  it('shows the not-found message on a 404 with a userId', async () => {
    sessionApiRequest.mockRejectedValue(apiError(404, 'User not found'));
    const state = await createDriver(
      { values: {} },
      form({ ...good, userId: UID }),
    );
    expect(state.formError).toBe(
      'The driver or the selected user no longer exists.',
    );
  });

  it('maps a 403 to the not-allowed message and refreshes', async () => {
    sessionApiRequest.mockRejectedValue(apiError(403));
    const state = await createDriver({ values: {} }, form(good));
    expect(state.formError).toBe(NOT_ALLOWED);
    expect(refresh).toHaveBeenCalled();
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(createDriver({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:/login',
    );
  });
});

describe('updateDriver', () => {
  const original = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    licenseNumber: 'AB-123',
    licenseExpiresOn: '2030-05-20',
    userId: UID as string | null,
  };
  const same = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    licenseNumber: 'AB-123',
    licenseExpiresOn: '2030-05-20',
  };

  it.each([null, undefined, 'text'])(
    'reports an out-of-date form when the bound original is %s',
    async (bad) => {
      const state = await updateDriver(
        ID,
        bad as unknown as typeof original,
        { values: {} },
        form(same),
      );
      expect(state.formError).toBe(OUT_OF_DATE);
      expect(sessionApiRequest).not.toHaveBeenCalled();
    },
  );

  it('reports an out-of-date form for a bad id or a bad original', async () => {
    expect(
      (await updateDriver('nope', original, { values: {} }, form(same)))
        .formError,
    ).toBe(OUT_OF_DATE);
    expect(
      (
        await updateDriver(
          ID,
          { ...original, licenseExpiresOn: '2024-02-30' },
          { values: {} },
          form(same),
        )
      ).formError,
    ).toBe(OUT_OF_DATE);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('redirects without an API call when nothing changed', async () => {
    await expect(
      updateDriver(
        ID,
        original,
        { values: {} },
        form({ ...same, userId: UID }),
      ),
    ).rejects.toThrow(`REDIRECT:/drivers/${ID}`);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('sends only the diff', async () => {
    sessionApiRequest.mockResolvedValue({});
    await expect(
      updateDriver(
        ID,
        original,
        { values: {} },
        form({ ...same, lastName: 'King', userId: UID }),
      ),
    ).rejects.toThrow(`REDIRECT:/drivers/${ID}?notice=driver-updated`);
    expect(sessionApiRequest).toHaveBeenCalledWith(`/drivers/${ID}`, {
      method: 'PATCH',
      mode: 'action',
      body: { lastName: 'King' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('sends userId null to unlink', async () => {
    sessionApiRequest.mockResolvedValue({});
    await expect(
      updateDriver(ID, original, { values: {} }, form({ ...same, userId: '' })),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({ userId: null });
  });

  it('leaves the link alone when the form has no userId field', async () => {
    sessionApiRequest.mockResolvedValue({});
    await expect(
      updateDriver(
        ID,
        original,
        { values: {} },
        form({ ...same, firstName: 'Augusta' }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      firstName: 'Augusta',
    });
  });

  it('shows the not-found message on a 404 and the API text on a 409', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    const changed = form({ ...same, firstName: 'X' });
    expect(
      (await updateDriver(ID, original, { values: {} }, changed)).formError,
    ).toBe('This driver no longer exists.');
    sessionApiRequest.mockRejectedValueOnce(
      apiError(409, 'This user is already linked to a driver'),
    );
    expect(
      (await updateDriver(ID, original, { values: {} }, changed)).formError,
    ).toBe('This user is already linked to a driver');
  });
});

describe('deleteDriver', () => {
  it('rejects a bad id without a request', async () => {
    expect(await deleteDriver('nope')).toEqual({ error: 'Driver not found.' });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('deletes, revalidates and redirects with the flash key', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(deleteDriver(ID)).rejects.toThrow(
      'REDIRECT:/drivers?notice=driver-deleted',
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`/drivers/${ID}`, {
      method: 'DELETE',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('returns the API message on a 409', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(409, 'Driver has assignments and cannot be deleted'),
    );
    expect(await deleteDriver(ID)).toEqual({
      error: 'Driver has assignments and cannot be deleted',
    });
  });

  it('shows the not-found message on a 404 and not-allowed on a 403', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(404));
    expect((await deleteDriver(ID)).error).toMatch(/already have been deleted/);
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect((await deleteDriver(ID)).error).toBe(NOT_ALLOWED);
  });
});
