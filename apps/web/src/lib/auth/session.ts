import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';
import {
  SESSION_COOKIE,
  decryptSession,
  encryptSession,
  type SessionPayload,
} from './session-crypto';

export { SESSION_COOKIE };

/** A session counts as expired this long before the token really expires. */
export const SESSION_EXPIRY_SKEW_MS = 30_000;

export type Session = SessionPayload;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Decrypts a cookie value and checks expiry. Shared with the proxy. */
export function readSessionValue(
  value: string | undefined,
  now: number = Date.now(),
): Session | null {
  if (!value) return null;
  const session = decryptSession(value, getServerEnv().SESSION_SECRET);
  if (!session) return null;
  if (session.expiresAt - SESSION_EXPIRY_SKEW_MS <= now) return null;
  return session;
}

export async function createSession(
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const value = encryptSession(
    { accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 },
    getServerEnv().SESSION_SECRET,
  );
  (await cookies()).set(
    SESSION_COOKIE,
    value,
    sessionCookieOptions(expiresInSeconds),
  );
}

export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return readSessionValue(store.get(SESSION_COOKIE)?.value);
});

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
