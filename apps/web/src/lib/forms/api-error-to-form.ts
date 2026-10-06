import { refresh } from 'next/cache';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import {
  NOT_ALLOWED_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
} from '@/lib/auth/messages';

export type ApiFormErrors<F extends string> = {
  fieldErrors?: Partial<Record<F, string[]>>;
  formError?: string;
};

/**
 * Maps an API failure to form state. Only call it from a Server Action: on a
 * 403 it calls `refresh()`, so the shared layout (navigation and user menu) is
 * rendered again with fresh data after the user's role changed. Anything that
 * is not an API error (including the redirect errors thrown by
 * sessionApiRequest) is rethrown.
 */
export function apiErrorToFormState<F extends string>(
  error: unknown,
  options: { fields: readonly F[]; notFoundMessage: string },
): ApiFormErrors<F> {
  if (error instanceof ApiConnectionError) {
    return { formError: SERVICE_UNAVAILABLE_MESSAGE };
  }
  if (!(error instanceof ApiError)) throw error;

  if (error.status >= 500) return { formError: SERVICE_UNAVAILABLE_MESSAGE };
  if (error.status === 403) {
    refresh();
    return { formError: NOT_ALLOWED_MESSAGE };
  }
  if (error.status === 404) return { formError: options.notFoundMessage };
  if (error.status === 400) {
    const fieldErrors: Partial<Record<F, string[]>> = {};
    for (const field of options.fields) {
      const messages = error.fieldErrors[field];
      if (messages?.length) fieldErrors[field] = messages;
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  }
  return { formError: error.message };
}
