import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiRequest, type ApiRequestOptions } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { PATHNAME_HEADER, loginUrl, safeReturnTo } from './return-to';
import { deleteSession, getSession } from './session';

export type SessionApiOptions = Omit<ApiRequestOptions, 'accessToken'> & {
  /**
   * 'render' (default): Server Components and layouts, where cookies cannot be
   * changed. 'action': Server Actions and Route Handlers.
   */
  mode?: 'render' | 'action';
};

async function currentPath(): Promise<string> {
  return safeReturnTo((await headers()).get(PATHNAME_HEADER));
}

async function handleUnauthorized(mode: 'render' | 'action'): Promise<never> {
  const returnTo = await currentPath();
  if (mode === 'action') {
    await deleteSession();
    redirect(loginUrl({ reason: 'expired', returnTo }));
  }
  // Cookies cannot be deleted while rendering; the route handler verifies the
  // session against the API and clears the cookie.
  redirect(`/session-expired?returnTo=${encodeURIComponent(returnTo)}`);
}

/**
 * Authenticated API call. Redirects on a missing session or a 401; every other
 * error (including 403) is rethrown unchanged. Code that wraps this in
 * try/catch must catch only ApiError/ApiConnectionError, or call
 * unstable_rethrow(error) first, so the redirect is not swallowed.
 */
export async function sessionApiRequest<T>(
  path: `/${string}`,
  options: SessionApiOptions = {},
): Promise<T> {
  const { mode = 'render', ...requestOptions } = options;
  const session = await getSession();
  if (!session) return handleUnauthorized(mode);
  try {
    return await apiRequest<T>(path, {
      ...requestOptions,
      accessToken: session.accessToken,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return handleUnauthorized(mode);
    }
    throw error;
  }
}
