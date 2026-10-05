import { expect, test } from '@playwright/test';
import {
  forgeSession,
  sessionCookie,
  setRawSessionCookie,
  signIn,
} from './support/session';
import { ADMIN, DRIVER } from './support/users';

test('unauthenticated visit redirects to login, then returns after sign-in', async ({
  page,
}) => {
  await page.goto('/?view=e2e');
  await expect(page).toHaveURL(/\/login\?returnTo=%2F%3Fview%3De2e$/);

  await signIn(page, ADMIN);
  await expect(page).toHaveURL('/?view=e2e');
  await expect(page.getByRole('banner')).toContainText(ADMIN.name);
  await expect(page.getByRole('banner')).toContainText(ADMIN.role);
  await expect(
    page.getByText(`Signed in as ${ADMIN.name} (${ADMIN.role})`),
  ).toBeVisible();
});

test('the session cookie is httpOnly and not a readable JWT', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await signIn(page, ADMIN);
  await expect(page).toHaveURL('/');

  const cookie = await sessionCookie(context);
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.value.startsWith('eyJ')).toBe(false);
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain('fleetops_session');
});

test('invalid credentials keep the form values and set no cookie', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await signIn(page, ADMIN, 'wrong-password');

  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Invalid credentials',
  );
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Organization')).toHaveValue('acme-logistics');
  await expect(page.getByLabel('Email')).toHaveValue(ADMIN.email);
  await expect(page.getByLabel('Password')).toHaveValue('');
  expect(await sessionCookie(context)).toBeUndefined();
});

test('a driver signs in and sees the DRIVER role', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, DRIVER);
  await expect(page.getByRole('banner')).toContainText(DRIVER.role);
});

test('sign out clears the session', async ({ page, context }) => {
  await page.goto('/login');
  await signIn(page, ADMIN);
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed-out$/);
  await expect(page.getByRole('status')).toHaveText(
    'You have been signed out.',
  );
  expect(await sessionCookie(context)).toBeUndefined();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('an expired cookie redirects to login and is deleted', async ({
  page,
  context,
}) => {
  await forgeSession(context, {
    accessToken: 'whatever',
    expiresAt: Date.now() - 60_000,
  });
  await page.goto('/?view=x');
  await expect(page).toHaveURL(
    /\/login\?reason=expired&returnTo=%2F%3Fview%3Dx$/,
  );
  await expect(page.getByRole('status')).toHaveText(
    'Your session has expired. Please sign in again.',
  );
  expect(await sessionCookie(context)).toBeUndefined();
});

test('an API 401 on a valid-looking session goes through /session-expired', async ({
  page,
  context,
}) => {
  await forgeSession(context, {
    accessToken: 'invalid.token.value',
    expiresAt: Date.now() + 600_000,
  });
  await page.goto('/?view=x');
  await expect(page).toHaveURL(
    /\/login\?reason=expired&returnTo=%2F%3Fview%3Dx$/,
  );
  await expect(page.getByRole('status')).toHaveText(
    'Your session has expired. Please sign in again.',
  );
  expect(await sessionCookie(context)).toBeUndefined();

  await signIn(page, ADMIN);
  await expect(page).toHaveURL('/?view=x');
});

test('a tampered cookie is rejected and deleted', async ({ page, context }) => {
  await setRawSessionCookie(context, 'v1.AAAA.AAAA.AAAA');
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?reason=expired$/);
  expect(await sessionCookie(context)).toBeUndefined();
});

for (const unsafe of [
  '//evil.example',
  'https://evil.example',
  '/.//evil.example',
]) {
  test(`an unsafe returnTo (${unsafe}) lands on /`, async ({ page }) => {
    await page.goto(`/login?returnTo=${encodeURIComponent(unsafe)}`);
    await signIn(page, ADMIN);
    await expect(page).toHaveURL('/');
  });
}

test('an authenticated visit to /login redirects to /', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, ADMIN);
  await expect(page).toHaveURL('/');
  await page.goto('/login');
  await expect(page).toHaveURL('/');
});
