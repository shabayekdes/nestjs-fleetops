import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { encryptSession } from '@/lib/auth/session-crypto';
import { proxy } from './proxy';

const SECRET = 'test-session-secret-0123456789abcdef';
const ORIGIN = 'http://localhost:3001';

function cookieValue(expiresAt: number) {
  return encryptSession({ accessToken: 'tok', expiresAt }, SECRET);
}
const valid = () => cookieValue(Date.now() + 600_000);

function req(
  path: string,
  init: { method?: string; cookie?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (init.cookie !== undefined) {
    headers.set('cookie', `fleetops_session=${init.cookie}`);
  }
  return new NextRequest(`${ORIGIN}${path}`, { method: init.method, headers });
}

function location(response: Response): string {
  return (
    new URL(response.headers.get('location') ?? '').pathname +
    new URL(response.headers.get('location') ?? '').search
  );
}

describe('proxy: protected routes', () => {
  it('redirects to login with returnTo when there is no cookie', () => {
    const res = proxy(req('/vehicles?page=2'));
    expect(res.status).toBe(307);
    expect(location(res)).toBe('/login?returnTo=%2Fvehicles%3Fpage%3D2');
  });

  it('omits returnTo for /', () => {
    expect(location(proxy(req('/')))).toBe('/login');
  });

  it('passes a valid session and sets the pathname header', () => {
    const res = proxy(req('/vehicles?x=1', { cookie: valid() }));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-fleetops-pathname')).toBe(
      '/vehicles?x=1',
    );
  });

  it('overwrites a client-sent pathname header', () => {
    const res = proxy(
      req('/a', {
        cookie: valid(),
        headers: { 'x-fleetops-pathname': '/evil' },
      }),
    );
    expect(res.headers.get('x-middleware-request-x-fleetops-pathname')).toBe(
      '/a',
    );
  });

  it.each([
    ['expired', cookieValue(Date.now() - 1000)],
    ['tampered', 'v1.AAAA.AAAA.AAAA'],
  ])('redirects with reason=expired and deletes a %s cookie', (_l, cookie) => {
    const res = proxy(req('/vehicles', { cookie }));
    expect(location(res)).toBe('/login?reason=expired&returnTo=%2Fvehicles');
    expect(res.headers.get('set-cookie')).toMatch(/fleetops_session=;/);
  });

  it('does not redirect a POST without a session', () => {
    const res = proxy(req('/vehicles', { method: 'POST' }));
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy: /login', () => {
  it('redirects a signed-in user to the sanitized returnTo', () => {
    const res = proxy(req('/login?returnTo=/vehicles', { cookie: valid() }));
    expect(location(res)).toBe('/vehicles');
  });

  it('falls back to / for an unsafe returnTo', () => {
    const res = proxy(
      req('/login?returnTo=//evil.example', { cookie: valid() }),
    );
    expect(location(res)).toBe('/');
  });

  it('falls back to / for a dot-segment returnTo', () => {
    const res = proxy(req('/login?returnTo=/.//evil.com', { cookie: valid() }));
    expect(new URL(res.headers.get('location') ?? '').origin).toBe(ORIGIN);
    expect(location(res)).toBe('/');
  });

  it('shows the form without a session', () => {
    expect(proxy(req('/login')).headers.get('location')).toBeNull();
  });
});

describe('proxy: public paths', () => {
  it.each(['/session-expired', '/dev/api-health'])(
    'lets %s through without a cookie',
    (path) => {
      expect(proxy(req(path)).headers.get('location')).toBeNull();
    },
  );
});
