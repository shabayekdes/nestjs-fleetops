import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { encryptSession } from '@/lib/auth/session-crypto';
import { GET } from './route';

const SECRET = 'test-session-secret-0123456789abcdef';

function req(returnTo: string | null, cookie?: string) {
  const url = new URL('http://localhost:3001/session-expired');
  if (returnTo !== null) url.searchParams.set('returnTo', returnTo);
  const headers = new Headers();
  if (cookie) headers.set('cookie', `fleetops_session=${cookie}`);
  return new NextRequest(url, { headers });
}

const validCookie = () =>
  encryptSession(
    { accessToken: 'tok', expiresAt: Date.now() + 600_000 },
    SECRET,
  );

function loc(res: Response) {
  const u = new URL(res.headers.get('location') ?? '');
  return u.pathname + u.search;
}

describe('GET /session-expired', () => {
  it('goes to login and deletes the cookie when there is no cookie', async () => {
    const res = await GET(req('/vehicles'));
    expect(loc(res)).toBe('/login?reason=expired&returnTo=%2Fvehicles');
    expect(res.headers.get('set-cookie')).toMatch(/fleetops_session=;/);
  });

  it('goes to login and deletes the cookie when /auth/me returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 401 }),
    );
    const res = await GET(req('/vehicles', validCookie()));
    expect(loc(res)).toBe('/login?reason=expired&returnTo=%2Fvehicles');
    expect(res.headers.get('set-cookie')).toMatch(/fleetops_session=;/);
  });

  it('returns to the page without deleting when /auth/me is 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1' })),
    );
    const res = await GET(req('/vehicles?x=1', validCookie()));
    expect(loc(res)).toBe('/vehicles?x=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('treats an unreachable API as expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('down'));
    const res = await GET(req('/', validCookie()));
    expect(loc(res)).toBe('/login?reason=expired');
    expect(res.headers.get('set-cookie')).toMatch(/fleetops_session=;/);
  });

  it('sanitizes an unsafe returnTo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const res = await GET(req('//evil.example', validCookie()));
    expect(loc(res)).toBe('/');
  });
});
