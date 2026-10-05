import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session', () => ({ createSession }));
vi.mock('next/navigation', () => ({
  RedirectType: { replace: 'replace' },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { login } from './actions';
import { initialLoginState } from './login-schema';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const good = {
  organizationSlug: 'acme',
  email: 'a@b.test',
  password: 'secret',
};

function errorResponse(status: number, details?: unknown) {
  return new Response(
    JSON.stringify({
      statusCode: status,
      error: 'E',
      message: status === 401 ? 'Invalid credentials' : 'Bad',
      requestId: 'r',
      timestamp: 't',
      path: '/p',
      details,
    }),
    { status },
  );
}

beforeEach(() => {
  createSession.mockReset();
});

describe('login action', () => {
  it('returns field errors without calling the API on invalid input', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const state = await login(
      initialLoginState,
      form({ ...good, email: 'nope', password: '' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.fieldErrors?.email).toBeDefined();
    expect(state.fieldErrors?.password).toBeDefined();
    expect(state.values).toEqual({
      organizationSlug: 'acme',
      email: 'nope',
    });
  });

  it('maps 401 to the API message and never echoes the password', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(401));
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toBe('Invalid credentials');
    expect(JSON.stringify(state)).not.toContain('secret');
    expect(state.values).toEqual({
      organizationSlug: 'acme',
      email: 'a@b.test',
    });
  });

  it('maps 400 details to field errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      errorResponse(400, [{ field: 'email', messages: ['bad email'] }]),
    );
    const state = await login(initialLoginState, form(good));
    expect(state.fieldErrors).toEqual({ email: ['bad email'] });
    expect(state.formError).toBeUndefined();
  });

  it('falls back to the message for 400 without matching fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      errorResponse(400, [{ field: 'other', messages: ['x'] }]),
    );
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toBe('Bad');
  });

  it('maps 429 to a fixed message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(429));
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toBe(
      'Too many sign-in attempts. Please wait a minute and try again.',
    );
  });

  it('maps 500 to the unavailable message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(500));
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toBe(
      'The service is unavailable. Please try again shortly.',
    );
  });

  it.each([
    ['unreachable', new TypeError('down')],
    ['timeout', new DOMException('t', 'TimeoutError')],
  ])('maps a %s connection error to the unavailable message', async (_l, e) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(e);
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toMatch(/service is unavailable/);
  });

  it('treats a malformed 200 as unavailable and sets no cookie', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accessToken: '', tokenType: 'Bearer' })),
    );
    const state = await login(initialLoginState, form(good));
    expect(state.formError).toMatch(/service is unavailable/);
    expect(createSession).not.toHaveBeenCalled();
  });

  function okResponse() {
    return new Response(
      JSON.stringify({
        accessToken: 'jwt',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
    );
  }

  it('creates the session and redirects to the sanitized returnTo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    await expect(
      login(initialLoginState, form({ ...good, returnTo: '/vehicles?p=2' })),
    ).rejects.toThrow('REDIRECT:/vehicles?p=2');
    expect(createSession).toHaveBeenCalledWith('jwt', 900);
  });

  it('redirects an unsafe returnTo to /', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    await expect(
      login(initialLoginState, form({ ...good, returnTo: '//evil' })),
    ).rejects.toThrow('REDIRECT:/');
  });
});
