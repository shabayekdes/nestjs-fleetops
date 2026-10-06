import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  createUserViaApi,
  loginStatusViaApi,
  sweepUsersByEmailPrefix,
  uniqueSuffix,
} from './support/api';
import { signIn } from './support/session';
import { ADMIN, E2E_USER_PASSWORD } from './support/users';

const NEW_PASSWORD = 'E2E-new-pass-456!';

// A dedicated e2e driver per test: changing a password must never touch seed
// users. It is deleted afterwards through the API.
let suffix = '';
let adminToken = '';
let me = { id: '', email: '' };

test.beforeEach(async ({ request, page }) => {
  suffix = uniqueSuffix();
  adminToken = await apiToken(request, ADMIN);
  me = await createUserViaApi(request, adminToken, {
    email: `e2e-${suffix.toLowerCase()}-1@acme-logistics.test`,
    role: 'DRIVER',
    firstName: `E2E-${suffix}`,
    lastName: 'Password',
  });
  await page.goto('/login');
  await signIn(page, me, E2E_USER_PASSWORD);
  await expect(page).toHaveURL('/');
});

test.afterEach(async ({ request }) => {
  await sweepUsersByEmailPrefix(
    request,
    adminToken,
    `e2e-${suffix.toLowerCase()}-`,
  );
});

async function fillForm(
  page: Page,
  values: { current: string; next: string; confirm: string },
) {
  await page.getByLabel('Current password').fill(values.current);
  await page.getByLabel('New password', { exact: true }).fill(values.next);
  await page.getByLabel('Confirm new password').fill(values.confirm);
  await page.getByRole('button', { name: 'Change password' }).click();
}

async function expectEmpty(page: Page) {
  await expect(page.getByLabel('Current password')).toHaveValue('');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByLabel('Confirm new password')).toHaveValue('');
}

test('the user menu links to the change password page', async ({ page }) => {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Change password' }).click();
  await expect(page).toHaveURL('/account/password');
  await expect(
    page.getByRole('heading', { name: 'Change password' }),
  ).toBeVisible();
});

test('a wrong current password shows the API message and empties the form', async ({
  page,
}) => {
  await page.goto('/account/password');
  await fillForm(page, {
    current: 'not-my-password-1',
    next: NEW_PASSWORD,
    confirm: NEW_PASSWORD,
  });
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Current password is incorrect' }),
  ).toBeVisible();
  await expectEmpty(page);
  // Still signed in.
  await page.goto('/vehicles');
  await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
});

test('the same password as the current one is rejected by the API', async ({
  page,
}) => {
  await page.goto('/account/password');
  await fillForm(page, {
    current: E2E_USER_PASSWORD,
    next: E2E_USER_PASSWORD,
    confirm: E2E_USER_PASSWORD,
  });
  await expect(
    page.getByRole('alert').filter({
      hasText: 'newPassword must differ from currentPassword',
    }),
  ).toBeVisible();
  await expectEmpty(page);
});

test('a confirmation mismatch is shown under the confirm field', async ({
  page,
}) => {
  await page.goto('/account/password');
  await fillForm(page, {
    current: E2E_USER_PASSWORD,
    next: NEW_PASSWORD,
    confirm: `${NEW_PASSWORD}x`,
  });
  const confirm = page.getByLabel('Confirm new password');
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#confirmPassword-error')).toHaveText(
    'Passwords do not match',
  );
  await expectEmpty(page);
});

test('changing the password keeps the session and switches the password', async ({
  page,
  request,
}) => {
  await page.goto('/account/password');
  await fillForm(page, {
    current: E2E_USER_PASSWORD,
    next: NEW_PASSWORD,
    confirm: NEW_PASSWORD,
  });
  await expect(page).toHaveURL('/account/password?notice=password-changed');
  await expect(page.getByRole('status')).toContainText('Password changed.');
  await expectEmpty(page);

  await page.goto('/vehicles');
  await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();

  const oldLogin = await loginStatusViaApi(
    request,
    me.email,
    E2E_USER_PASSWORD,
  );
  expect(oldLogin).toBe(401);
  await expect(apiToken(request, me, NEW_PASSWORD)).resolves.toBeTruthy();
});
