import type { BrowserContext, Page } from '@playwright/test';
import {
  SESSION_COOKIE,
  encryptSession,
} from '../../src/lib/auth/session-crypto';
import { E2E_SESSION_SECRET, WEB_URL } from './env';
import { ORGANIZATION_SLUG, PASSWORD } from './users';

export async function forgeSession(
  context: BrowserContext,
  payload: { accessToken: string; expiresAt: number },
): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: encryptSession(payload, E2E_SESSION_SECRET),
      url: WEB_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function setRawSessionCookie(
  context: BrowserContext,
  value: string,
): Promise<void> {
  await context.addCookies([
    { name: SESSION_COOKIE, value, url: WEB_URL, httpOnly: true },
  ]);
}

export async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies(WEB_URL);
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE);
}

export async function signIn(
  page: Page,
  user: { email: string },
  password: string = PASSWORD,
): Promise<void> {
  await page.getByLabel('Organization').fill(ORGANIZATION_SLUG);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
