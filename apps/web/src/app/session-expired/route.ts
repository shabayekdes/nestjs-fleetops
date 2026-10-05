import { NextResponse, type NextRequest } from 'next/server';
import { apiRequest } from '@/lib/api/client';
import { loginUrl, safeReturnTo } from '@/lib/auth/return-to';
import { SESSION_COOKIE, readSessionValue } from '@/lib/auth/session';

// Landing point for a render-time 401 (cookies cannot be changed during a
// render). It asks the API whether the session is really dead: if so it clears
// the cookie and goes to login, otherwise it returns to the page.
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  const toLogin = () => {
    const response = NextResponse.redirect(
      new URL(loginUrl({ reason: 'expired', returnTo }), request.url),
    );
    response.cookies.delete(SESSION_COOKIE);
    return response;
  };

  const session = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return toLogin();

  try {
    await apiRequest('/auth/me', { accessToken: session.accessToken });
  } catch {
    return toLogin();
  }
  return NextResponse.redirect(new URL(returnTo, request.url));
}
