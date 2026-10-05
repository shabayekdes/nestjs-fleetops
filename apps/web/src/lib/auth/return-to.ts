const MAX_LENGTH = 2048;
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F\s\\]/;
const ORIGIN = 'http://n';

/** Request header the proxy sets with the current path (never trusted from the client). */
export const PATHNAME_HEADER = 'x-fleetops-pathname';

export type LoginReason = 'expired' | 'signed-out';

/**
 * Sanitizes a post-login redirect target. Returns a same-origin relative path
 * (pathname + search + hash), or '/' when the value is missing or unsafe.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (value.length < 1 || value.length > MAX_LENGTH) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (FORBIDDEN_CHARS.test(value)) return '/';
  if (!URL.canParse(value, ORIGIN)) return '/';
  const url = new URL(value, ORIGIN);
  if (url.origin !== ORIGIN) return '/';
  if (
    url.pathname === '/login' ||
    url.pathname.startsWith('/session-expired')
  ) {
    return '/';
  }
  // Dot segments can collapse into a protocol-relative path ('/.//evil.com'),
  // so check the normalized result again.
  const result = url.pathname + url.search + url.hash;
  if (result.startsWith('//') || result.startsWith('/\\')) return '/';
  return result;
}

export function loginUrl(
  options: { reason?: LoginReason; returnTo?: string } = {},
): string {
  const params = new URLSearchParams();
  if (options.reason) params.set('reason', options.reason);
  if (options.returnTo && options.returnTo !== '/') {
    params.set('returnTo', options.returnTo);
  }
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
