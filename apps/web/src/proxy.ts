import { NextResponse, type NextRequest } from 'next/server';
import { PATHNAME_HEADER, loginUrl, safeReturnTo } from '@/lib/auth/return-to';
import { SESSION_COOKIE, readSessionValue } from '@/lib/auth/session';

// Optimistic check only: reads the cookie, never calls the API. The API is
// still the authority, and sessionApiRequest handles a 401 from it.

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/session-expired' ||
    pathname === '/dev' ||
    pathname.startsWith('/dev/')
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const method = request.method;
  const isNavigation = method === 'GET' || method === 'HEAD';

  // Always overwrite: a client-sent value must never reach the app.
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, pathname + search);
  const next = () => NextResponse.next({ request: { headers } });

  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === '/login') {
    if (isNavigation && readSessionValue(cookieValue)) {
      const target = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
      return NextResponse.redirect(new URL(target, request.url));
    }
    return next();
  }

  if (isPublicPath(pathname) || !isNavigation) return next();

  const returnTo = safeReturnTo(pathname + search);
  if (cookieValue === undefined) {
    return NextResponse.redirect(new URL(loginUrl({ returnTo }), request.url));
  }
  if (!readSessionValue(cookieValue)) {
    const response = NextResponse.redirect(
      new URL(loginUrl({ reason: 'expired', returnTo }), request.url),
    );
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  return next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
