import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SESSION_COOKIE, decryptSession } from '../src/lib/auth/session-crypto';
import {
  apiToken,
  createMaintenanceRecordViaApi,
  createVehicleViaApi,
  deleteMaintenanceRecordViaApi,
  getVehicleViaApi,
  sweepVehiclesByMake,
  uniqueSuffix,
  uniqueVin,
} from './support/api';
import { E2E_SESSION_SECRET, WEB_URL } from './support/env';
import { forgeSession, signIn } from './support/session';
import { ADMIN, DRIVER, MANAGER } from './support/users';

// Seed vehicle: read only, never modified (Ford Transit with related records).
const SEED_VIN = '1FTBW3XM5PKA00001';
const NOT_ALLOWED = 'You are not allowed to do this.';

// Every vehicle a test creates has this make, so the sweep can remove it.
let make = '';
let adminToken = '';
let records: { vehicleId: string; recordId: string }[] = [];

test.beforeEach(async ({ request }) => {
  make = `E2E-${uniqueSuffix()}`;
  records = [];
  adminToken = await apiToken(request, ADMIN);
});

test.afterEach(async ({ request }) => {
  try {
    for (const { vehicleId, recordId } of records) {
      await deleteMaintenanceRecordViaApi(
        request,
        adminToken,
        vehicleId,
        recordId,
      );
    }
  } finally {
    // Runs even if a record delete failed, so vehicles are still removed.
    await sweepVehiclesByMake(request, adminToken, make);
  }
});

async function login(page: Page, user: { email: string }) {
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL('/');
}

function currentIdFromUrl(page: Page): string {
  const match = /\/vehicles\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no vehicle id in ${page.url()}`);
  return match[1];
}

async function fillVehicleForm(
  page: Page,
  values: {
    make?: string;
    model?: string;
    year?: string;
    vin?: string;
    licensePlate?: string;
  },
) {
  if (values.make !== undefined)
    await page.getByLabel('Make').fill(values.make);
  if (values.model !== undefined) {
    await page.getByLabel('Model').fill(values.model);
  }
  if (values.year !== undefined)
    await page.getByLabel('Year').fill(values.year);
  if (values.vin !== undefined) await page.getByLabel('VIN').fill(values.vin);
  if (values.licensePlate !== undefined) {
    await page.getByLabel('License plate').fill(values.licensePlate);
  }
}

test('an admin creates, edits and deletes a vehicle', async ({
  page,
  request,
}) => {
  const vin = uniqueVin();
  const plate = `e2e-${uniqueSuffix().slice(-6)}`.toLowerCase();
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  await fillVehicleForm(page, {
    make,
    model: 'Created Model',
    year: '2021',
    vin: vin.toLowerCase(),
    licensePlate: plate,
  });
  await page.getByRole('button', { name: 'Create vehicle' }).click();

  await expect(page).toHaveURL(
    /\/vehicles\/[0-9a-f-]{36}\?notice=vehicle-created/,
  );
  await expect(page.getByRole('status')).toContainText('Vehicle created.');
  await expect(page.getByText(vin, { exact: true })).toBeVisible();
  await expect(
    page.getByText(plate.toUpperCase(), { exact: true }),
  ).toBeVisible();
  const id = currentIdFromUrl(page);

  // Edit: change the model and clear the plate.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(`/vehicles/${id}/edit`);
  await expect(page.getByLabel('Make')).toHaveValue(make);
  await page.getByLabel('Model').fill('Edited Model');
  await page.getByLabel('License plate').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(`/vehicles/${id}?notice=vehicle-updated`);
  await expect(page.getByRole('status')).toContainText('Vehicle updated.');
  await expect(page.getByText('Not registered')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Edited Model' })).toBeVisible();

  const vehicle = await getVehicleViaApi(request, adminToken, id);
  expect(vehicle.licensePlate).toBeNull();
  expect(vehicle).toMatchObject({
    make,
    model: 'Edited Model',
    year: 2021,
    vin,
  });

  // Delete through the confirmation dialog.
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this vehicle?');
  await expect(dialog).toContainText(vin);
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL('/vehicles?notice=vehicle-deleted');
  await expect(page.getByRole('status')).toContainText('Vehicle deleted.');

  await page.goto(`/vehicles?make=${encodeURIComponent(make)}`);
  await expect(page.getByText('No vehicles match these filters')).toBeVisible();
});

test('a duplicate VIN shows the API message on the form', async ({
  page,
  request,
}) => {
  const existing = await createVehicleViaApi(request, adminToken, { make });
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  await fillVehicleForm(page, {
    make,
    model: 'Duplicate Model',
    year: '2020',
    vin: existing.vin,
  });
  await page.getByRole('button', { name: 'Create vehicle' }).click();

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A vehicle with this VIN already exists' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/vehicles/new');
  await expect(page.getByLabel('Model')).toHaveValue('Duplicate Model');
  await expect(page.getByLabel('VIN')).toHaveValue(existing.vin);
});

test('an API 400 is shown under the VIN field', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  // 17 characters, so it passes the browser and Zod checks; the API rejects I.
  await fillVehicleForm(page, {
    make,
    model: 'Bad Vin',
    year: '2020',
    vin: 'IIIIIIIIIIIIIIIII',
  });
  await page.getByRole('button', { name: 'Create vehicle' }).click();

  const vin = page.getByLabel('VIN');
  await expect(vin).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#vin-error')).not.toBeEmpty();
  await expect(vin).toHaveValue('IIIIIIIIIIIIIIIII');
  await expect(page).toHaveURL('/vehicles/new');
});

test('deleting a vehicle with related records is blocked by a 409', async ({
  page,
  request,
}) => {
  const vehicle = await createVehicleViaApi(request, adminToken, { make });
  const record = await createMaintenanceRecordViaApi(
    request,
    adminToken,
    vehicle.id,
  );
  records.push({ vehicleId: vehicle.id, recordId: record.id });

  await login(page, ADMIN);
  await page.goto(`/vehicles/${vehicle.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(dialog).toContainText(
    'Vehicle has related records and cannot be deleted',
  );
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}`);
});

test('a driver can read vehicles but not change them', async ({ page }) => {
  await login(page, DRIVER);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Vehicles' })).toBeVisible();
  await nav.getByRole('link', { name: 'Vehicles' }).click();
  await expect(page).toHaveURL('/vehicles');

  // Filter so the seed vehicle does not depend on its position in page 1.
  await page.goto('/vehicles?make=Ford');
  const seedRow = page.getByRole('row').filter({ hasText: SEED_VIN });
  await expect(seedRow).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add vehicle' })).toHaveCount(0);

  await seedRow.getByRole('link').click();
  await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}$/);
  await expect(page.getByText(SEED_VIN)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  const id = currentIdFromUrl(page);

  await page.goto('/vehicles/new');
  await expect(
    page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
  ).toBeVisible();
  await page.goto(`/vehicles/${id}/edit`);
  await expect(
    page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
  ).toBeVisible();
});

test('a manager sees Add vehicle', async ({ page }) => {
  await login(page, MANAGER);
  await page.goto('/vehicles');
  await expect(page.getByRole('link', { name: 'Add vehicle' })).toBeVisible();
});

test('a missing or malformed vehicle id shows "Vehicle not found" in the shell', async ({
  page,
}) => {
  await login(page, ADMIN);
  const missing = `01900000-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
  for (const path of [
    `/vehicles/${missing}`,
    '/vehicles/not-a-uuid',
    '/vehicles/not-a-uuid/edit',
  ]) {
    await page.goto(path);
    // Asserted on content: a not-found after streaming starts returns 200.
    await expect(
      page.getByRole('heading', { name: 'Vehicle not found' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  }
});

test('filters and pagination live in the URL', async ({ page, request }) => {
  for (const year of [2020, 2021, 2021]) {
    await createVehicleViaApi(request, adminToken, { make, year });
  }
  await login(page, ADMIN);

  const params = () => new URL(page.url()).searchParams;
  const rows = page.locator('tbody tr');

  await page.goto('/vehicles?limit=2');
  await page.getByLabel('Make').fill(make);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => params().get('make')).toBe(make);
  expect(params().get('limit')).toBe('2');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('Showing 1–2 of 3')).toBeVisible();

  await page.getByRole('link', { name: 'Next' }).click();
  await expect.poll(() => params().get('page')).toBe('2');
  expect(params().get('make')).toBe(make);
  expect(params().get('limit')).toBe('2');
  await expect(rows).toHaveCount(1);

  await page.reload();
  await expect(rows).toHaveCount(1);
  expect(params().get('page')).toBe('2');
  expect(params().get('make')).toBe(make);

  await page.getByLabel('Year').fill('2021');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => params().get('year')).toBe('2021');
  expect(params().get('page')).toBeNull();
  await expect(rows).toHaveCount(2);

  await page.getByLabel('Year').fill('1999');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No vehicles match these filters')).toBeVisible();

  await page.getByRole('link', { name: 'Clear filters' }).first().click();
  await expect.poll(() => params().get('year')).toBeNull();
  expect(params().get('make')).toBeNull();
  expect(params().get('limit')).toBe('2');

  await page.goto('/vehicles?page=abc&year=1800');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Some filters in the address were not valid and were ignored.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('submit is disabled once the session has expired', async ({
  page,
  context,
}) => {
  await login(page, ADMIN);
  const cookie = (await context.cookies(WEB_URL)).find(
    (c) => c.name === SESSION_COOKIE,
  );
  const payload = decryptSession(cookie?.value ?? '', E2E_SESSION_SECRET);
  if (!payload) throw new Error('no readable session cookie');
  await forgeSession(context, {
    accessToken: payload.accessToken,
    expiresAt: Date.now() + 100_000,
  });

  await page.clock.install();
  await page.goto('/vehicles/new');
  const submit = page.getByRole('button', { name: 'Create vehicle' });
  await expect(submit).toBeEnabled();

  await page.clock.fastForward('03:00');
  await expect(submit).toBeDisabled();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Your session has expired.' }),
  ).toBeVisible();
});
