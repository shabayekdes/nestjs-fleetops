import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => store }));
// React's cache() is a pass-through outside a render in tests.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

import { encryptSession } from './session-crypto';
import {
  SESSION_COOKIE,
  SESSION_EXPIRY_SKEW_MS,
  createSession,
  deleteSession,
  getSession,
} from './session';

const SECRET = 'test-session-secret-0123456789abcdef';

function cookieFor(expiresAt: number, accessToken = 'tok') {
  return { value: encryptSession({ accessToken, expiresAt }, SECRET) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createSession', () => {
  it('sets an httpOnly lax cookie that does not contain the token', async () => {
    await createSession('the.jwt.token', 900);
    const [name, value, options] = store.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(value).not.toContain('the.jwt.token');
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
      secure: false,
    });
  });

  it('is Secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await createSession('t', 900);
    expect(store.set.mock.calls[0][2].secure).toBe(true);
  });
});

describe('getSession', () => {
  it('returns null without a cookie', async () => {
    store.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  it('returns null for a tampered cookie', async () => {
    store.get.mockReturnValue({ value: 'v1.AAAA.AAAA.AAAA' });
    expect(await getSession()).toBeNull();
  });

  it('returns null for a past expiry', async () => {
    store.get.mockReturnValue(cookieFor(Date.now() - 1000));
    expect(await getSession()).toBeNull();
  });

  it('returns null within the skew window', async () => {
    store.get.mockReturnValue(
      cookieFor(Date.now() + SESSION_EXPIRY_SKEW_MS - 1000),
    );
    expect(await getSession()).toBeNull();
  });

  it('returns the session when valid', async () => {
    const expiresAt = Date.now() + 600_000;
    store.get.mockReturnValue(cookieFor(expiresAt, 'abc'));
    expect(await getSession()).toEqual({ accessToken: 'abc', expiresAt });
  });
});

describe('deleteSession', () => {
  it('deletes the cookie', async () => {
    await deleteSession();
    expect(store.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
