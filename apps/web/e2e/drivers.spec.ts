import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  cleanupE2eFixtures,
  createAssignmentViaApi,
  createDriverViaApi,
  createUserViaApi,
  createVehicleViaApi,
  endAssignmentViaApi,
  findDriverByLicenseViaApi,
  getDriverViaApi,
  isoDateFromToday,
  meViaApi,
  uniqueSuffix,
} from './support/api';
import { signIn } from './support/session';
import { expectUrl } from './support/url';
import { ADMIN, DRIVER, MANAGER } from './support/users';

const EMAIL_DOMAIN = 'acme-logistics.test';

// Everything a test creates is named from this suffix: driver firstName
// `E2E-<suffix>`, licenseNumber `E2E-<SUFFIX>-<n>`, vehicle make
// `E2E-<suffix>`, user email `e2e-<suffix>-<n>@acme-logistics.test`.
let suffix = '';
let counter = 0;
let adminToken = '';

function nextLicense(): string {
  counter += 1;
  return `E2E-${suffix}-${counter}`;
}

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
  counter = 0;
  adminToken = await apiToken(request, ADMIN);
});

test.afterEach(async ({ request }) => {
  await cleanupE2eFixtures(request, adminToken, suffix);
});

async function login(page: Page, user: { email: string }) {
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL('/');
}

function currentIdFromUrl(page: Page): string {
  const match = /\/drivers\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no driver id in ${page.url()}`);
  return match[1];
}

function newDriver(
  request: Parameters<typeof createDriverViaApi>[0],
  extra: Partial<Parameters<typeof createDriverViaApi>[2]> = {},
) {
  return createDriverViaApi(request, adminToken, {
    firstName: `E2E-${suffix}`,
    licenseNumber: nextLicense(),
    ...extra,
  });
}

async function fillDriverForm(
  page: Page,
  values: {
    firstName?: string;
    lastName?: string;
    licenseNumber?: string;
    licenseExpiresOn?: string;
  },
) {
  if (values.firstName !== undefined) {
    await page.getByLabel('First name').fill(values.firstName);
  }
  if (values.lastName !== undefined) {
    await page.getByLabel('Last name').fill(values.lastName);
  }
  if (values.licenseNumber !== undefined) {
    await page.getByLabel('License number').fill(values.licenseNumber);
  }
  if (values.licenseExpiresOn !== undefined) {
    await page.getByLabel('License expires on').fill(values.licenseExpiresOn);
  }
}

test('an admin creates, edits and deletes a driver', async ({ page }) => {
  const license = nextLicense();
  await login(page, ADMIN);
  await page.goto('/drivers/new');
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'Created',
    licenseNumber: license.toLowerCase(),
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByRole('button', { name: 'Create driver' }).click();

  await expect(page).toHaveURL(
    /\/drivers\/[0-9a-f-]{36}\?notice=driver-created/,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('status')).toContainText('Driver created.', {
    timeout: 15_000,
  });
  // Entered in lower case, shown and saved in upper case.
  await expect(page.getByText(license, { exact: true })).toBeVisible();
  await expect(page.getByText('Mar 15, 2031', { exact: true })).toBeVisible();
  await expect(page.getByText('Expired', { exact: true })).toHaveCount(0);
  const id = currentIdFromUrl(page);

  // Edit: move the expiry to the past.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(`/drivers/${id}/edit`, { timeout: 15_000 });
  await expect(page.getByLabel('License number')).toHaveValue(license);
  await page.getByLabel('License expires on').fill('2020-01-02');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/drivers/${id}?notice=driver-updated`, {
    timeout: 15_000,
  });
  await expect(page.getByRole('status')).toContainText('Driver updated.', {
    timeout: 15_000,
  });
  await expect(page.getByText('Jan 2, 2020', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Expired', { exact: true }).first(),
  ).toBeVisible();

  // Delete through the confirmation dialog.
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this driver?');
  await expect(dialog).toContainText(license);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/drivers?notice=driver-deleted', {
    timeout: 15_000,
  });
  await expect(page.getByRole('status')).toContainText('Driver deleted.', {
    timeout: 15_000,
  });
});

test('a duplicate license in another case shows the API message', async ({
  page,
  request,
}) => {
  const existing = await newDriver(request);
  await login(page, ADMIN);
  await page.goto('/drivers/new');
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'Duplicate',
    licenseNumber: existing.licenseNumber.toLowerCase(),
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByRole('button', { name: 'Create driver' }).click();

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A driver with this license number already exists' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/drivers/new', { timeout: 15_000 });
  await expect(page.getByLabel('Last name')).toHaveValue('Duplicate');
  await expect(page.getByLabel('License number')).toHaveValue(
    existing.licenseNumber.toLowerCase(),
  );
});

test('an API 400 is shown under the license number', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/drivers/new');
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'Bad',
    licenseNumber: '-BAD-',
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByRole('button', { name: 'Create driver' }).click();

  const license = page.getByLabel('License number');
  await expect(license).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#licenseNumber-error')).not.toBeEmpty();
  await expect(license).toHaveValue('-BAD-');
  await expect(page).toHaveURL('/drivers/new', { timeout: 15_000 });
});

test('an admin links, unlinks and cannot double-link a login account', async ({
  page,
  request,
}) => {
  counter += 1;
  const linkable = await createUserViaApi(request, adminToken, {
    email: `e2e-${suffix.toLowerCase()}-${counter}@${EMAIL_DOMAIN}`,
    role: 'DRIVER',
    firstName: `E2E-${suffix}`,
  });
  await login(page, ADMIN);

  // Link at creation.
  await page.goto('/drivers/new');
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'Linked',
    licenseNumber: nextLicense(),
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByLabel('Login account').selectOption(linkable.id);
  await page.getByRole('button', { name: 'Create driver' }).click();
  await expect(page).toHaveURL(
    /\/drivers\/[0-9a-f-]{36}\?notice=driver-created/,
    { timeout: 15_000 },
  );
  const id = currentIdFromUrl(page);
  await expect(
    page.getByRole('definition').filter({ hasText: /^Linked/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'View user' }).click();
  await expect(page).toHaveURL(`/users/${linkable.id}`, { timeout: 15_000 });
  expect((await getDriverViaApi(request, adminToken, id)).body?.userId).toBe(
    linkable.id,
  );

  // Unlink by choosing "Not linked".
  await page.goto(`/drivers/${id}/edit`);
  await expect(page.getByLabel('Login account')).toHaveValue(linkable.id);
  await page.getByLabel('Login account').selectOption('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/drivers/${id}?notice=driver-updated`, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole('definition').filter({ hasText: 'Not linked' }),
  ).toBeVisible();
  expect(
    (await getDriverViaApi(request, adminToken, id)).body?.userId,
  ).toBeNull();

  // The seed driver user is already linked to the seed driver Sam.
  const sam = await meViaApi(request, await apiToken(request, DRIVER));
  await page.goto('/drivers/new');
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'Thief',
    licenseNumber: nextLicense(),
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByLabel('Login account').selectOption(sam.id);
  await page.getByRole('button', { name: 'Create driver' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'This user is already linked to a driver' }),
  ).toBeVisible();
  const seedSam = await findDriverByLicenseViaApi(
    request,
    adminToken,
    'DL-1001',
  );
  expect(seedSam?.userId).toBe(sam.id);
});

test('a manager sees Drivers, has no account field and keeps the link on edit', async ({
  page,
  request,
}) => {
  counter += 1;
  const linkable = await createUserViaApi(request, adminToken, {
    email: `e2e-${suffix.toLowerCase()}-${counter}@${EMAIL_DOMAIN}`,
    role: 'DRIVER',
    firstName: `E2E-${suffix}`,
  });
  const linked = await newDriver(request, { userId: linkable.id });
  await login(page, MANAGER);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Drivers' })).toBeVisible();

  await page.goto('/drivers/new');
  await expect(page.getByLabel('Login account')).toHaveCount(0);
  await fillDriverForm(page, {
    firstName: `E2E-${suffix}`,
    lastName: 'ByManager',
    licenseNumber: nextLicense(),
    licenseExpiresOn: '2031-03-15',
  });
  await page.getByRole('button', { name: 'Create driver' }).click();
  await expect(page).toHaveURL(
    /\/drivers\/[0-9a-f-]{36}\?notice=driver-created/,
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole('definition').filter({ hasText: 'Not linked' }),
  ).toBeVisible();

  await page.goto(`/drivers/${linked.id}`);
  await expect(
    page.getByRole('definition').filter({ hasText: /^Linked/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View user' })).toHaveCount(0);
  await page.goto(`/drivers/${linked.id}/edit`);
  await expect(page.getByLabel('Login account')).toHaveCount(0);
  await page.getByLabel('Last name').fill('Renamed');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/drivers/${linked.id}?notice=driver-updated`, {
    timeout: 15_000,
  });

  const after = await getDriverViaApi(request, adminToken, linked.id);
  expect(after.body).toMatchObject({
    lastName: 'Renamed',
    userId: linkable.id,
  });
});

test('the list marks expired and soon-to-expire licenses', async ({
  page,
  request,
}) => {
  const soon = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(10),
  });
  const expired = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(-5),
  });
  const valid = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(200),
  });
  await login(page, ADMIN);
  await page.goto('/drivers');

  const rowOf = (license: string) =>
    page.getByRole('row').filter({ hasText: license });
  await expect(rowOf(soon.licenseNumber)).toContainText('Expires soon');
  await expect(rowOf(expired.licenseNumber)).toContainText('Expired');
  await expect(rowOf(valid.licenseNumber)).not.toContainText('Expire');
});

test('the license filter lives in the URL and keeps only matching drivers', async ({
  page,
  request,
}) => {
  const expired = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(-5),
  });
  const soon = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(10),
  });
  const valid = await newDriver(request, {
    licenseExpiresOn: isoDateFromToday(200),
  });
  await login(page, ADMIN);
  await page.goto('/drivers?limit=100');

  const table = page.getByRole('table');
  const rowOf = (license: string) =>
    table.getByRole('row').filter({ hasText: license });
  await expect(rowOf(valid.licenseNumber)).toBeVisible();

  await page.getByLabel('License', { exact: true }).selectOption('EXPIRED');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expectUrl(page, '/drivers', {
    licenseStatus: 'EXPIRED',
    limit: '100',
  });
  await expect(page.getByLabel('License', { exact: true })).toHaveValue(
    'EXPIRED',
  );
  await expect(rowOf(expired.licenseNumber)).toBeVisible();
  await expect(rowOf(soon.licenseNumber)).toHaveCount(0);
  await expect(rowOf(valid.licenseNumber)).toHaveCount(0);

  // A reload keeps the filter.
  await page.reload();
  await expect(page.getByLabel('License', { exact: true })).toHaveValue(
    'EXPIRED',
  );
  await expect(rowOf(expired.licenseNumber)).toBeVisible();

  await page.goto('/drivers?licenseStatus=EXPIRING_SOON&limit=100');
  await expect(rowOf(soon.licenseNumber)).toContainText('Expires soon');
  await expect(rowOf(expired.licenseNumber)).toHaveCount(0);

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expectUrl(page, '/drivers', { limit: '100' });
  await expect(rowOf(valid.licenseNumber)).toBeVisible();
});

test('Clear filters also resets the select', async ({ page, request }) => {
  await newDriver(request);
  await login(page, ADMIN);
  await page.goto('/drivers?licenseStatus=EXPIRING_SOON');
  await expect(page.getByLabel('License', { exact: true })).toHaveValue(
    'EXPIRING_SOON',
  );
  await page
    .getByRole('form', { name: 'Filter drivers' })
    .getByRole('link', { name: 'Clear filters' })
    .click();
  await expectUrl(page, '/drivers');
  await expect(page.getByLabel('License', { exact: true })).toHaveValue('', {
    timeout: 3000,
  });
});

test('a driver with assignment history cannot be deleted', async ({
  page,
  request,
}) => {
  const driver = await newDriver(request);
  const vehicle = await createVehicleViaApi(request, adminToken, {
    make: `E2E-${suffix}`,
  });
  const assignment = await createAssignmentViaApi(request, adminToken, {
    vehicleId: vehicle.id,
    driverId: driver.id,
  });
  await endAssignmentViaApi(request, adminToken, assignment.id);

  await login(page, ADMIN);
  await page.goto(`/drivers/${driver.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toContainText(
    'Driver has assignments and cannot be deleted',
  );
  expect((await getDriverViaApi(request, adminToken, driver.id)).status).toBe(
    200,
  );
});

test('a missing or malformed driver id shows "Driver not found" in the shell', async ({
  page,
}) => {
  await login(page, ADMIN);
  for (const id of ['0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'not-a-uuid']) {
    await page.goto(`/drivers/${id}`);
    await expect(page.getByText('Driver not found')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  }
});

test('the page and limit live in the URL', async ({ page, request }) => {
  await newDriver(request);
  await newDriver(request);
  await login(page, ADMIN);
  await page.goto('/drivers?limit=1&page=2');
  await expect(page.getByRole('row')).toHaveCount(2); // header + one row
  await expect(page.getByText(/Showing 2–2 of \d+/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Previous' })).toHaveAttribute(
    'href',
    '/drivers?limit=1',
  );
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL('/drivers?limit=1&page=3', { timeout: 15_000 });
});
