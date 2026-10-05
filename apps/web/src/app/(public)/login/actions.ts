'use server';

import { z } from 'zod';
import { RedirectType, redirect } from 'next/navigation';
import { apiRequest } from '@/lib/api/client';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import type { LoginResponse } from '@/lib/api/types';
import {
  SERVICE_UNAVAILABLE_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/lib/auth/messages';
import { safeReturnTo } from '@/lib/auth/return-to';
import { createSession } from '@/lib/auth/session';
import { loginSchema, type LoginField, type LoginState } from './login-schema';

const FIELDS: LoginField[] = ['organizationSlug', 'email', 'password'];

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function isValidLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.accessToken === 'string' &&
    body.accessToken !== '' &&
    body.tokenType === 'Bearer' &&
    typeof body.expiresIn === 'number' &&
    Number.isFinite(body.expiresIn) &&
    body.expiresIn > 0
  );
}

function mapApiError(
  error: ApiError,
): Pick<LoginState, 'fieldErrors' | 'formError'> {
  if (error.status === 429) return { formError: TOO_MANY_ATTEMPTS_MESSAGE };
  if (error.status >= 500) return { formError: SERVICE_UNAVAILABLE_MESSAGE };
  if (error.status === 400) {
    const fieldErrors: LoginState['fieldErrors'] = {};
    for (const field of FIELDS) {
      const messages = error.fieldErrors[field];
      if (messages?.length) fieldErrors[field] = messages;
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  }
  return { formError: error.message };
}

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const values = {
    organizationSlug: text(formData, 'organizationSlug'),
    email: text(formData, 'email'),
  };
  const input = { ...values, password: text(formData, 'password') };

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let accessToken: string;
  let expiresIn: number;
  try {
    const response = await apiRequest<unknown>('/auth/login', {
      method: 'POST',
      body: parsed.data,
    });
    if (!isValidLoginResponse(response)) {
      return { values, formError: SERVICE_UNAVAILABLE_MESSAGE };
    }
    ({ accessToken, expiresIn } = response);
  } catch (error) {
    if (error instanceof ApiError) return { values, ...mapApiError(error) };
    if (error instanceof ApiConnectionError) {
      return { values, formError: SERVICE_UNAVAILABLE_MESSAGE };
    }
    throw error;
  }

  await createSession(accessToken, expiresIn);
  // Outside try/catch: redirect() works by throwing.
  redirect(safeReturnTo(formData.get('returnTo')), RedirectType.replace);
}
