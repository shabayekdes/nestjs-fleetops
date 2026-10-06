import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  createUserViaApi,
  deleteUserRawViaApi,
  getUserViaApi,
  meViaApi,
  sweepUsersByEmailPrefix,
  uniqueSuffix,
  updateUserViaApi,
} from './support/api';
import { signIn } from './support/session';
import { ADMIN, DRIVER, E2E_USER_PASSWORD, MANAGER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';
const EMAIL_DOMAIN = 'acme-logistics.test';

// Every user a test creates has an email starting with `e2e-<suffix>-` and the
// names `E2E-<suffix>`, so the sweep can remove them. Seed users are never
// modified. Tests that act on their own record use a dedicated e2e user.
let suffix = '';
let counter = 0;
let adminToken = '';

function nextEmail(): string {
  counter += 1;
  return `e2e-${suffix.toLowerCase()}-${counter}@${EMAIL_DOMAIN}`;
}

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
  counter = 0;
  adminToken = await apiToken(request, ADMIN);
});

test.afterEach(async ({ request }) => {
  await sweepUsersByEmailPrefix(
    request,
    adminToken,
    `e2e-${suffix.toLowerCase()}-`,
  );
});

async function login(page: Page, user: { email: string }, password?: string) {
  await page.goto('/login');
  await signIn(page, user, password);
  await expect(page).toHaveURL('/');
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

function createE2eUser(
  request: Parameters<typeof createUserViaApi>[0],
  role: 'ADMIN' | 'MANAGER' | 'DRIVER',
  lastName = 'User',
) {
  return createUserViaApi(request, adminToken, {
    email: nextEmail(),
    role,
    firstName: `E2E-${suffix}`,
    lastName,
  });
}

function currentIdFromUrl(page: Page): string {
  const match = /\/users\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no user id in ${page.url()}`);
  return match[1];
}

test('an admin creates, edits and deletes a user', async ({
  page,
  request,
}) => {
  const email = nextEmail();
  await login(page, ADMIN);
  await page.goto('/users/new');
  await page.getByLabel('First name').fill(`E2E-${suffix}`);
  await page.getByLabel('Last name').fill('Created');
  // Mixed case: the API stores it in lower case.
  await page
    .getByLabel('Email')
    .fill(email.replace('e2e-', 'E2E-').replace('acme', 'Acme'));
  await page.getByLabel('Password').fill(E2E_USER_PASSWORD);
  await expect(page.getByLabel('Role')).toHaveValue('');
  await page.getByLabel('Role').selectOption('DRIVER');
  await page.getByRole('button', { name: 'Create user' }).click();

  await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}\?notice=user-created/);
  await expect(page.getByRole('status')).toContainText('User created.');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Driver' })).toBeVisible();
  const id = currentIdFromUrl(page);

  // Edit: change the last name and the role.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(`/users/${id}/edit`);
  await expect(page.getByLabel('First name')).toHaveValue(`E2E-${suffix}`);
  await expect(page.getByLabel('Role')).toHaveValue('DRIVER');
  await page.getByLabel('Last name').fill('Edited');
  await page.getByLabel('Role').selectOption('MANAGER');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(`/users/${id}?notice=user-updated`);
  await expect(page.getByRole('status')).toContainText('User updated.');
  await expect(page.locator('dd', { hasText: 'Manager' })).toBeVisible();
  const fetched = await getUserViaApi(request, adminToken, id);
  expect(fetched.status).toBe(200);
  expect(fetched.body).toMatchObject({
    email,
    lastName: 'Edited',
    role: 'MANAGER',
  });

  await page.goto('/users?role=MANAGER');
  await expect(
    page.getByRole('link', { name: `E2E-${suffix} Edited` }),
  ).toBeVisible();

  // Delete through the confirmation dialog.
  await page.goto(`/users/${id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this user?');
  await expect(dialog).toContainText(email);
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL('/users?notice=user-deleted');
  await expect(page.getByRole('status')).toContainText('User deleted.');
  expect((await getUserViaApi(request, adminToken, id)).status).toBe(404);
});

test('a duplicate email shows the API message and keeps the form', async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto('/users/new');
  await page.getByLabel('First name').fill(`E2E-${suffix}`);
  await page.getByLabel('Last name').fill('Duplicate');
  // The seed manager, in another case. The create fails, so nothing is added.
  await page.getByLabel('Email').fill('Morgan@ACME-logistics.test');
  await page.getByLabel('Password').fill(E2E_USER_PASSWORD);
  await page.getByLabel('Role').selectOption('DRIVER');
  await page.getByRole('button', { name: 'Create user' }).click();

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A user with this email already exists' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/users/new');
  await expect(page.getByLabel('First name')).toHaveValue(`E2E-${suffix}`);
  await expect(page.getByLabel('Last name')).toHaveValue('Duplicate');
  await expect(page.getByLabel('Role')).toHaveValue('DRIVER');
  await expect(page.getByLabel('Password')).toHaveValue('');
});

test('an API 400 is shown under the Email field', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/users/new');
  await page.getByLabel('First name').fill(`E2E-${suffix}`);
  await page.getByLabel('Last name').fill('BadEmail');
  // Passes the browser and Zod checks; the API rejects it.
  await page.getByLabel('Email').fill('a@b');
  await page.getByLabel('Password').fill(E2E_USER_PASSWORD);
  await page.getByLabel('Role').selectOption('DRIVER');
  await page.getByRole('button', { name: 'Create user' }).click();

  const email = page.getByLabel('Email');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#email-error')).not.toBeEmpty();
  await expect(email).toHaveValue('a@b');
  await expect(page).toHaveURL('/users/new');
});

test('your own record cannot change its role or be deleted', async ({
  page,
  request,
}) => {
  const me = await createE2eUser(request, 'ADMIN', 'Self');
  await login(page, me, E2E_USER_PASSWORD);

  // Detail page: Delete is disabled and the hint is linked to it.
  await page.goto(`/users/${me.id}`);
  const deleteButton = page.getByRole('button', { name: 'Delete' });
  await expect(deleteButton).toBeDisabled();
  await expect(deleteButton).toHaveAccessibleDescription(
    'You cannot delete your own account.',
  );
  await expect(page.getByText('This is your account.')).toBeVisible();

  // Edit page: the role select is disabled; force it to test the API's check.
  await page.goto(`/users/${me.id}/edit`);
  const role = page.getByLabel('Role');
  await expect(role).toBeDisabled();
  await expect(role).toHaveAccessibleDescription(
    'You cannot change your own role.',
  );
  await role.evaluate((el) => el.removeAttribute('disabled'));
  await role.selectOption('DRIVER');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You cannot change your own role' }),
  ).toBeVisible();

  // The self-delete rule is the API's: prove it with the user's own token.
  const ownToken = await apiToken(request, me, E2E_USER_PASSWORD);
  const deleted = await deleteUserRawViaApi(request, ownToken, me.id);
  expect(deleted.status).toBe(409);
  expect(deleted.body?.message).toBe('You cannot delete your own account');

  const fetched = await getUserViaApi(request, adminToken, me.id);
  expect(fetched.body?.role).toBe('ADMIN');
});

test('managers and drivers get no Users link and see NotAllowed', async ({
  page,
  request,
}) => {
  const adminId = (await meViaApi(request, adminToken)).id;
  for (const user of [MANAGER, DRIVER]) {
    await page.context().clearCookies();
    await login(page, user);
    await expect(
      nav(page).getByRole('link', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
    for (const path of [
      '/users',
      '/users/new',
      `/users/${adminId}`,
      `/users/${adminId}/edit`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
      ).toBeVisible();
    }
  }
});

test('a demoted admin: client navigation shows NotAllowed and drops the Users link', async ({
  page,
  request,
}) => {
  const admin = await createE2eUser(request, 'ADMIN', 'Demoted');
  await login(page, admin, E2E_USER_PASSWORD);
  await expect(nav(page).getByRole('link', { name: 'Users' })).toBeVisible();

  await updateUserViaApi(request, adminToken, admin.id, { role: 'MANAGER' });
  // The layout still has the old role; a client navigation does not reload it.
  await nav(page).getByRole('link', { name: 'Users' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
  ).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
});

test('a demoted admin: a form submit shows NotAllowed and drops the Users link', async ({
  page,
  request,
}) => {
  const admin = await createE2eUser(request, 'ADMIN', 'Demoted');
  const target = await createE2eUser(request, 'DRIVER', 'Target');
  await login(page, admin, E2E_USER_PASSWORD);
  await page.goto(`/users/${target.id}/edit`);
  await expect(nav(page).getByRole('link', { name: 'Users' })).toBeVisible();

  await updateUserViaApi(request, adminToken, admin.id, { role: 'MANAGER' });
  await page.getByLabel('Last name').fill('Changed');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
  ).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
  expect(
    (await getUserViaApi(request, adminToken, target.id)).body?.lastName,
  ).toBe('Target');
});

test('a missing or malformed user id shows "User not found" in the shell', async ({
  page,
}) => {
  await login(page, ADMIN);
  const missing = `01900000-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
  for (const path of [
    `/users/${missing}`,
    '/users/not-a-uuid',
    '/users/not-a-uuid/edit',
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'User not found' }),
    ).toBeVisible();
    await expect(nav(page)).toBeVisible();
  }
});

test('editing your own name updates the header and the user menu', async ({
  page,
  request,
}) => {
  const me = await createE2eUser(request, 'ADMIN', 'Before');
  await login(page, me, E2E_USER_PASSWORD);
  await page.goto(`/users/${me.id}/edit`);
  await page.getByLabel('First name').fill(`E2E-${suffix}-Renamed`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/users/${me.id}?notice=user-updated`);

  const newName = `E2E-${suffix}-Renamed Before`;
  await expect(page.getByRole('banner')).toContainText(newName);
  const trigger = page.getByRole('button', { name: /Account menu/ });
  await expect(trigger).toHaveAccessibleName(`Account menu, ${newName}`);
  await trigger.click();
  await expect(page.getByRole('menu')).toContainText(newName);
});

test('the role filter and paging live in the URL', async ({
  page,
  request,
}) => {
  await createE2eUser(request, 'MANAGER', 'One');
  await login(page, ADMIN);

  // The seed has a manager too, so there are at least two managers.
  await page.goto('/users?role=MANAGER&limit=1');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByLabel('Role')).toHaveValue('MANAGER');

  const params = () => new URL(page.url()).searchParams;
  await page.getByRole('link', { name: 'Next' }).click();
  await expect.poll(() => params().get('page')).toBe('2');
  expect(params().get('role')).toBe('MANAGER');
  expect(params().get('limit')).toBe('1');
  await page.getByRole('link', { name: 'Previous' }).click();
  await expect.poll(() => params().get('page')).toBeNull();
  expect(params().get('role')).toBe('MANAGER');
  expect(params().get('limit')).toBe('1');

  await page.goto('/users?role=admin');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Some filters in the address were not valid and were ignored.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});
