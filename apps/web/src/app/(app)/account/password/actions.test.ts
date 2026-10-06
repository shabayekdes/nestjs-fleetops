import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const sessionApiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { changePassword } from './actions';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  currentPassword: 'old-password-1',
  newPassword: 'new-password-12',
  confirmPassword: 'new-password-12',
};

function apiError(
  status: number,
  message: string,
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
  refresh.mockReset();
});

describe('changePassword', () => {
  it('makes no API call when the confirmation does not match', async () => {
    const state = await changePassword(
      { values: {} },
      form({ ...good, confirmPassword: 'other-password-1' }),
    );
    expect(sessionApiRequest).not.toHaveBeenCalled();
    expect(state.fieldErrors?.confirmPassword).toEqual([
      'Passwords do not match',
    ]);
    expect(state.values).toEqual({});
  });

  it('sends exactly the current and new password and redirects with a flash', async () => {
    sessionApiRequest.mockResolvedValue(undefined);
    await expect(changePassword({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:/account/password?notice=password-changed',
    );
    expect(sessionApiRequest).toHaveBeenCalledWith('/auth/me/password', {
      method: 'PATCH',
      mode: 'action',
      body: {
        currentPassword: 'old-password-1',
        newPassword: 'new-password-12',
      },
    });
  });

  it.each([
    'Current password is incorrect',
    'newPassword must differ from currentPassword',
  ])(
    'shows the 400 "%s" as a form error and echoes nothing',
    async (message) => {
      sessionApiRequest.mockRejectedValue(apiError(400, message));
      const state = await changePassword({ values: {} }, form(good));
      expect(state.formError).toBe(message);
      expect(state.fieldErrors).toBeUndefined();
      expect(state.values).toEqual({});
    },
  );

  it('maps a 400 with details to field errors', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(400, 'Validation failed', {
        newPassword: ['newPassword is too long'],
      }),
    );
    const state = await changePassword({ values: {} }, form(good));
    expect(state.fieldErrors).toEqual({
      newPassword: ['newPassword is too long'],
    });
    expect(state.values).toEqual({});
  });

  it('shows the API message for a 429', async () => {
    sessionApiRequest.mockRejectedValue(
      apiError(429, 'Too many requests, please try again later'),
    );
    const state = await changePassword({ values: {} }, form(good));
    expect(state.formError).toBe('Too many requests, please try again later');
  });

  it('maps a 403 and refreshes', async () => {
    sessionApiRequest.mockRejectedValue(apiError(403, 'Forbidden'));
    const state = await changePassword({ values: {} }, form(good));
    expect(state.formError).toBe('You are not allowed to do this.');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('lets a 401 redirect pass through', async () => {
    sessionApiRequest.mockRejectedValue(new Error('REDIRECT:/login'));
    await expect(changePassword({ values: {} }, form(good))).rejects.toThrow(
      'REDIRECT:/login',
    );
  });
});
