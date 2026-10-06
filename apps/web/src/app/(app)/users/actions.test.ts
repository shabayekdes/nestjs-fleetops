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

import { createUser, deleteUser, updateUser } from './actions';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PASSWORD = 'correct horse battery';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  firstName: ' Ada ',
  lastName: ' Lovelace ',
  email: ' Ada@Example.TEST ',
  password: PASSWORD,
  role: 'DRIVER',
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

describe('createUser', () => {
  it('returns field errors and makes no API call on invalid input', async () => {
    const state = await createUser(
      { values: {} },
      form({ ...good, firstName: '', password: 'short', role: '' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.firstName).toEqual(['Enter a first name']);
    expect(state.fieldErrors?.password).toEqual([
      'Password must be at least 12 characters',
    ]);
    expect(state.fieldErrors?.role).toEqual(['Choose a role']);
  });

  it('never echoes the password', async () => {
    const invalid = await createUser(
      { values: {} },
      form({ ...good, password: 'short' }),
    );
    expect(invalid.values).not.toHaveProperty('password');

    sessionApiRequest.mockRejectedValue(apiError(409, 'Duplicate'));
    const rejected = await createUser({ values: {} }, form(good));
    expect(rejected.values).not.toHaveProperty('password');
    expect(JSON.stringify(rejected)).not.toContain(PASSWORD);
  });

  it('sends a normalized body and redirects with a flash', async () => {
    sessionApiRequest.mockResolvedValue({ id: ID });
    await expect(createUser({ values: {} }, form(good))).rejects.toThrow(
      `REDIRECT:/users/${ID}?notice=user-created`,
    );
    expect(sessionApiRequest).toHaveBeenCalledWith('/users', {
      method: 'POST',
      mode: 'action',
      body: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        password: PASSWORD,
        role: 'DRIVER',
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('maps a 400 to field errors', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', {
        email: ['email must be an email'],
        password: ['too weak'],
      }),
    );
    const state = await createUser({ values: {} }, form(good));
    expect(state.fieldErrors).toEqual({
      email: ['email must be an email'],
      password: ['too weak'],
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('shows the API message for a duplicate email', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(409, 'A user with this email already exists'),
    );
    const state = await createUser({ values: {} }, form(good));
    expect(state.formError).toBe('A user with this email already exists');
    expect(state.values.firstName).toBe(' Ada ');
  });

  it('maps 403 (and refreshes) and 5xx', async () => {
    sessionApiRequest.mockRejectedValueOnce(apiError(403));
    expect((await createUser({ values: {} }, form(good))).formError).toBe(
      'You are not allowed to do this.',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    sessionApiRequest.mockRejectedValueOnce(apiError(500));
    expect((await createUser({ values: {} }, form(good))).formError).toMatch(
      /service is unavailable/,
    );
    sessionApiRequest.mockRejectedValueOnce(new ApiConnectionError('timeout'));
    expect((await createUser({ values: {} }, form(good))).formError).toMatch(
      /service is unavailable/,
    );
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(createUser({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:/login',
    );
  });
});

describe('updateUser', () => {
  const original = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    role: 'DRIVER' as const,
  };
  const same = {
    firstName: ' Ada ',
    lastName: 'Lovelace',
    email: 'ADA@example.test',
    role: 'DRIVER',
  };

  it('reports an out-of-date form for a bad id or original', async () => {
    const message = 'This form is out of date. Reload the page and try again.';
    expect(
      (await updateUser('nope', original, { values: {} }, form(same)))
        .formError,
    ).toBe(message);
    expect(
      (
        await updateUser(
          ID,
          null as unknown as typeof original,
          { values: {} },
          form(same),
        )
      ).formError,
    ).toBe(message);
    expect(
      (
        await updateUser(
          ID,
          { ...original, role: 'ROOT' as unknown as 'ADMIN' },
          { values: {} },
          form(same),
        )
      ).formError,
    ).toBe(message);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('returns field errors for invalid input', async () => {
    const state = await updateUser(
      ID,
      original,
      { values: {} },
      form({ ...same, firstName: '' }),
    );
    expect(state.fieldErrors?.firstName).toEqual(['Enter a first name']);
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('redirects without a PATCH when nothing changed', async () => {
    await expect(
      updateUser(ID, original, { values: {} }, form(same)),
    ).rejects.toThrow(`REDIRECT:/users/${ID}`);
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('sends only the changed keys', async () => {
    sessionApiRequest.mockResolvedValue({});
    await expect(
      updateUser(
        ID,
        original,
        { values: {} },
        form({ ...same, lastName: ' King ' }),
      ),
    ).rejects.toThrow(`REDIRECT:/users/${ID}?notice=user-updated`);
    expect(sessionApiRequest).toHaveBeenCalledWith(`/users/${ID}`, {
      method: 'PATCH',
      mode: 'action',
      body: { lastName: 'King' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('treats a missing role as unchanged and sends a changed role', async () => {
    sessionApiRequest.mockResolvedValue({});
    const { role: _role, ...withoutRole } = same;
    void _role;
    await expect(
      updateUser(
        ID,
        original,
        { values: {} },
        form({ ...withoutRole, firstName: 'Augusta' }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      firstName: 'Augusta',
    });

    sessionApiRequest.mockClear();
    await expect(
      updateUser(
        ID,
        original,
        { values: {} },
        form({ ...same, role: 'MANAGER' }),
      ),
    ).rejects.toThrow('REDIRECT:');
    expect(sessionApiRequest.mock.calls[0]?.[1].body).toEqual({
      role: 'MANAGER',
    });
  });

  it('keeps the role out of the echoed values when it was not submitted', async () => {
    sessionApiRequest.mockRejectedValue(apiError(409, 'X'));
    const { role: _role, ...withoutRole } = same;
    void _role;
    const state = await updateUser(
      ID,
      original,
      { values: {} },
      form({ ...withoutRole, firstName: 'Augusta' }),
    );
    expect(state.values).not.toHaveProperty('role');
  });

  it.each([
    [409, 'You cannot change your own role', 'You cannot change your own role'],
    [
      409,
      'A user with this email already exists',
      'A user with this email already exists',
    ],
    [404, 'User not found', 'This user no longer exists.'],
    [403, 'Forbidden', 'You are not allowed to do this.'],
  ])('maps a %i to a form error', async (status, message, expected) => {
    sessionApiRequest.mockRejectedValue(apiError(status, message));
    const state = await updateUser(
      ID,
      original,
      { values: {} },
      form({ ...same, role: 'MANAGER' }),
    );
    expect(state.formError).toBe(expected);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deleteUser', () => {
  it('makes no API call for an invalid id', async () => {
    expect(await deleteUser('nope')).toEqual({ error: 'User not found.' });
    expect(sessionApiRequest).not.toHaveBeenCalled();
  });

  it('deletes, revalidates and redirects with a flash', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(deleteUser(ID)).rejects.toThrow(
      'REDIRECT:/users?notice=user-deleted',
    );
    expect(sessionApiRequest).toHaveBeenCalledWith(`/users/${ID}`, {
      method: 'DELETE',
      mode: 'action',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it.each([
    [
      409,
      'You cannot delete your own account',
      'You cannot delete your own account',
    ],
    [
      404,
      'User not found',
      'This user was not found. It may already have been deleted.',
    ],
    [403, 'Forbidden', 'You are not allowed to do this.'],
  ])(
    'returns an error for %i and never throws',
    async (status, message, expected) => {
      sessionApiRequest.mockRejectedValue(apiError(status, message));
      expect(await deleteUser(ID)).toEqual({ error: expected });
    },
  );

  it('returns the unavailable message for 5xx', async () => {
    sessionApiRequest.mockRejectedValue(apiError(503));
    expect((await deleteUser(ID)).error).toMatch(/service is unavailable/);
  });

  it('does not swallow a session redirect', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(deleteUser(ID)).rejects.toThrow('REDIRECT:/login');
  });
});
