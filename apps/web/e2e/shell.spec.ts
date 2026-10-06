import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SESSION_COOKIE, decryptSession } from '../src/lib/auth/session-crypto';
import { E2E_SESSION_SECRET, WEB_URL } from './support/env';
import { forgeSession, signIn } from './support/session';
import { ADMIN, DRIVER, ORGANIZATION_NAME } from './support/users';

async function login(page: Page, user: { email: string }) {
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL('/');
}

test('desktop shell shows the organization and the active nav link', async ({
  page,
}) => {
  await login(page, ADMIN);
  await expect(page.getByRole('banner')).toContainText(ORGANIZATION_NAME);
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Dashboard' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dashboard' }),
  ).toBeVisible();
});

test('the admin user menu shows details and returns focus on Escape', async ({
  page,
}) => {
  await login(page, ADMIN);
  const trigger = page.getByRole('button', { name: /Account menu/ });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toContainText(ADMIN.name);
  await expect(menu).toContainText(ADMIN.email);
  await expect(menu).toContainText('Admin');
  await expect(menu).toContainText(ORGANIZATION_NAME);
  await expect(
    page.getByRole('menuitem', { name: 'Change password' }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('an admin sees the Users link', async ({ page }) => {
  await login(page, ADMIN);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
});

test('a driver sees Dashboard and no Users link', async ({ page }) => {
  await login(page, DRIVER);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
});

for (const [name, size] of [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test(`the ${name} layout uses a navigation drawer`, async ({ page }) => {
    await page.setViewportSize(size);
    await login(page, ADMIN);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    const open = page.getByRole('button', { name: 'Open navigation' });
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('navigation', { name: 'Main' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await open.click();
    await dialog.getByRole('link', { name: 'Dashboard' }).click();
    await expect(dialog).toBeHidden();
  });
}

test('the first Tab focuses the skip link and Enter moves to main', async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto('/'); // fresh document, focus at the start of the page
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('a session expiring soon shows the warning inside the shell', async ({
  page,
  context,
}) => {
  await login(page, ADMIN);
  const cookie = (await context.cookies(WEB_URL)).find(
    (c) => c.name === SESSION_COOKIE,
  );
  const payload = decryptSession(cookie?.value ?? '', E2E_SESSION_SECRET);
  if (!payload) throw new Error('no readable session cookie');

  // Keep the real token, shorten the lifetime (SESSION_EXPIRY_SKEW is 30 s).
  await forgeSession(context, {
    accessToken: payload.accessToken,
    expiresAt: Date.now() + 100_000,
  });
  await page.goto('/');
  const warning = page.getByRole('status').filter({ hasText: 'expires in' });
  await expect(warning).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
});
