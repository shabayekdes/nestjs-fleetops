import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  pathname: null as string | null,
}));

vi.mock('./session', () => ({
  getSession: mocks.getSession,
  deleteSession: mocks.deleteSession,
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(
      mocks.pathname === null ? {} : { 'x-fleetops-pathname': mocks.pathname },
    ),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { sessionApiRequest } from './session-api';

function apiErrorResponse(status: number) {
  return new Response(
    JSON.stringify({
      statusCode: status,
      error: 'E',
      message: 'm',
      requestId: 'r',
      timestamp: 't',
      path: '/p',
    }),
    { status },
  );
}

beforeEach(() => {
  mocks.pathname = '/vehicles?page=2';
  mocks.getSession.mockResolvedValue({
    accessToken: 'tok',
    expiresAt: Date.now() + 600_000,
  });
});

describe('sessionApiRequest', () => {
  it('sends the bearer token and returns the data', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    await expect(sessionApiRequest('/auth/me')).resolves.toEqual({ ok: 1 });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('redirects to /session-expired when there is no session (render)', async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(sessionApiRequest('/auth/me')).rejects.toThrow(
      'REDIRECT:/session-expired?returnTo=%2Fvehicles%3Fpage%3D2',
    );
  });

  it('redirects on 401 in render mode without deleting the cookie', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiErrorResponse(401));
    await expect(sessionApiRequest('/auth/me')).rejects.toThrow(
      'REDIRECT:/session-expired?returnTo=',
    );
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('deletes the session and redirects to login on 401 in action mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiErrorResponse(401));
    await expect(sessionApiRequest('/x', { mode: 'action' })).rejects.toThrow(
      'REDIRECT:/login?reason=expired&returnTo=%2Fvehicles%3Fpage%3D2',
    );
    expect(mocks.deleteSession).toHaveBeenCalledOnce();
  });

  it('rethrows 403 and keeps the session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiErrorResponse(403));
    const error = await sessionApiRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('rethrows 500 errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiErrorResponse(500));
    await expect(sessionApiRequest('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('rethrows connection errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('down'));
    await expect(sessionApiRequest('/x')).rejects.toBeInstanceOf(
      ApiConnectionError,
    );
  });

  it('uses / when the pathname header is missing', async () => {
    mocks.pathname = null;
    mocks.getSession.mockResolvedValue(null);
    await expect(sessionApiRequest('/x')).rejects.toThrow(
      'REDIRECT:/session-expired?returnTo=%2F',
    );
  });
});
