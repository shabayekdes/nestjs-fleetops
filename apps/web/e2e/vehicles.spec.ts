import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SESSION_COOKIE, decryptSession } from '../src/lib/auth/session-crypto';
import {
  apiToken,
  catalogRefsViaApi,
  createMaintenanceRecordViaApi,
  createVehicleViaApi,
  deleteMaintenanceRecordViaApi,
  getVehicleViaApi,
  sweepVehiclesByVinPrefix,
  uniqueSuffix,
  uniqueVin,
  vinPrefix,
  type CatalogRefs,
} from './support/api';
import { E2E_SESSION_SECRET, WEB_URL } from './support/env';
import { forgeSession, signIn } from './support/session';
import { ADMIN, DRIVER, MANAGER } from './support/users';

// Seed vehicle: read only, never modified (Ford Transit with related records).
const SEED_VIN = '1FTBW3XM5PKA00001';
const NOT_ALLOWED = 'You are not allowed to do this.';

// Every vehicle a test creates has a VIN starting with `vinPrefix(suffix)`
// (`E2E` + a run code), so the sweep can remove it. Vehicles of other runs and
// the seed share the lists: never assert exact counts.
let suffix = '';
let adminToken = '';
let refs: CatalogRefs;
let records: { vehicleId: string; recordId: string }[] = [];

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
  records = [];
  adminToken = await apiToken(request, ADMIN);
  refs = await catalogRefsViaApi(request, adminToken);
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
    await sweepVehiclesByVinPrefix(request, adminToken, vinPrefix(suffix));
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
    year?: string;
    vin?: string;
    licensePlate?: string;
  },
) {
  if (values.year !== undefined)
    await page.getByLabel('Year').fill(values.year);
  if (values.vin !== undefined) await page.getByLabel('VIN').fill(values.vin);
  if (values.licensePlate !== undefined) {
    await page.getByLabel('License plate').fill(values.licensePlate);
  }
}

/** Chooses the seeded Toyota, Corolla and Car in the form's dropdowns. */
async function chooseCatalog(page: Page) {
  await page.getByLabel('Make').selectOption({ label: refs.make.name });
  await expect(page.getByLabel('Model')).toBeEnabled();
  await page.getByLabel('Model').selectOption({ label: refs.model.name });
  await page
    .getByLabel('Vehicle type')
    .selectOption({ label: refs.vehicleType.name });
}

test('the model is disabled until a make is chosen and cleared when it changes', async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  const make = page.getByLabel('Make');
  const model = page.getByLabel('Model');
  await expect(model).toBeDisabled();

  await make.selectOption({ label: 'Toyota' });
  await expect(model).toBeEnabled();
  await expect(model.getByRole('option', { name: 'Corolla' })).toHaveCount(1);
  await model.selectOption({ label: 'Corolla' });
  await expect(model).toHaveValue(refs.model.id);

  // Another make: the model is cleared and offers that make's models only.
  await make.selectOption({ label: 'Ford' });
  await expect(model).toHaveValue('');
  await expect(model).toBeEnabled();
  await expect(model.getByRole('option', { name: 'Transit' })).toHaveCount(1);
  await expect(model.getByRole('option', { name: 'Corolla' })).toHaveCount(0);

  await make.selectOption({ label: 'Choose a make' });
  await expect(model).toBeDisabled();
  await expect(model).toHaveValue('');
});

test('an admin creates, edits and deletes a vehicle', async ({
  page,
  request,
}) => {
  // Several round trips to the (remote) test database: allow more time.
  test.slow();
  const vin = uniqueVin(suffix);
  const plate = `e2e-${uniqueSuffix().slice(-6)}`.toLowerCase();
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  await chooseCatalog(page);
  await fillVehicleForm(page, {
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
  await expect(page.locator('dd', { hasText: 'Toyota' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Corolla' })).toBeVisible();
  await expect(
    page.locator('dd', { hasText: refs.vehicleType.name }),
  ).toBeVisible();
  const id = currentIdFromUrl(page);

  // Edit: keep the make, change the model and the type, clear the plate.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(`/vehicles/${id}/edit`);
  await expect(page.getByLabel('Make')).toHaveValue(refs.make.id);
  await expect(page.getByLabel('Model')).toHaveValue(refs.model.id);
  await expect(page.getByLabel('Vehicle type')).toHaveValue(
    refs.vehicleType.id,
  );
  await page.getByLabel('Model').selectOption({ label: 'Camry' });
  await page.getByLabel('Vehicle type').selectOption({ label: 'Pickup' });
  await page.getByLabel('License plate').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(`/vehicles/${id}?notice=vehicle-updated`);
  await expect(page.getByRole('status')).toContainText('Vehicle updated.');
  await expect(page.getByText('Not registered')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Camry' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Pickup' })).toBeVisible();

  const vehicle = await getVehicleViaApi(request, adminToken, id);
  expect(vehicle.licensePlate).toBeNull();
  expect(vehicle).toMatchObject({
    make: { id: refs.make.id },
    model: { name: 'Camry' },
    vehicleType: { name: 'Pickup' },
    year: 2021,
    vin,
  });

  // Edit again: a different make needs a model, and the API accepts the pair.
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Make').selectOption({ label: 'Ford' });
  await expect(page.getByLabel('Model')).toHaveValue('');
  await page.getByLabel('Model').selectOption({ label: 'Ranger' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/vehicles/${id}?notice=vehicle-updated`);
  await expect(page.locator('dd', { hasText: 'Ranger' })).toBeVisible();

  // Delete through the confirmation dialog.
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this vehicle?');
  await expect(dialog).toContainText(vin);
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL('/vehicles?notice=vehicle-deleted');
  await expect(page.getByRole('status')).toContainText('Vehicle deleted.');
});

test('a missing model stops the submit and keeps the chosen make', async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  await page.getByLabel('Make').selectOption({ label: 'Toyota' });
  await page
    .getByLabel('Vehicle type')
    .selectOption({ label: refs.vehicleType.name });
  await fillVehicleForm(page, {
    year: '2021',
    vin: uniqueVin(suffix),
  });
  await page.getByRole('button', { name: 'Create vehicle' }).click();

  // The browser's required check stops the submit; the page stays put and
  // the chosen make is still selected.
  await expect(page).toHaveURL('/vehicles/new');
  await expect(page.getByLabel('Make')).toHaveValue(refs.make.id);
  await expect(page.getByLabel('Model')).toHaveValue('');
});

test('a duplicate VIN shows the API message on the form', async ({
  page,
  request,
}) => {
  // Several round trips to the (remote) test database: allow more time.
  test.slow();
  const existing = await createVehicleViaApi(request, adminToken, {
    refs,
    suffix,
  });
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  await chooseCatalog(page);
  await fillVehicleForm(page, { year: '2020', vin: existing.vin });
  await page.getByRole('button', { name: 'Create vehicle' }).click();

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A vehicle with this VIN already exists' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/vehicles/new');
  // The chosen catalog values survive the failed submit.
  await expect(page.getByLabel('Make')).toHaveValue(refs.make.id);
  await expect(page.getByLabel('Model')).toHaveValue(refs.model.id);
  await expect(page.getByLabel('Vehicle type')).toHaveValue(
    refs.vehicleType.id,
  );
  await expect(page.getByLabel('VIN')).toHaveValue(existing.vin);
});

test('an API 400 is shown under the VIN field', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/vehicles/new');
  // 17 characters, so it passes the browser and Zod checks; the API rejects I.
  await chooseCatalog(page);
  await fillVehicleForm(page, { year: '2020', vin: 'IIIIIIIIIIIIIIIII' });
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
  const vehicle = await createVehicleViaApi(request, adminToken, {
    refs,
    suffix,
  });
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
  await page.getByLabel('Make').selectOption({ label: 'Ford' });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/makeId=/);
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
  // Several round trips to the (remote) test database: allow more time.
  test.slow();
  for (const year of [2020, 2021, 2021]) {
    await createVehicleViaApi(request, adminToken, { refs, suffix, year });
  }
  await login(page, ADMIN);

  const params = () => new URL(page.url()).searchParams;
  const rows = page.locator('tbody tr');

  await page.goto('/vehicles?limit=2');
  await page.getByLabel('Make').selectOption({ label: refs.make.name });
  await expect(page.getByLabel('Model')).toBeEnabled();
  await page.getByLabel('Model').selectOption({ label: refs.model.name });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => params().get('makeId')).toBe(refs.make.id);
  expect(params().get('modelId')).toBe(refs.model.id);
  expect(params().get('limit')).toBe('2');
  // At least our three vehicles match, so the first page is full.
  await expect(rows).toHaveCount(2);
  await expect(page.getByText(/Showing 1–2 of \d+/)).toBeVisible();
  // The filter selects stay in sync with the URL.
  await expect(page.getByLabel('Make')).toHaveValue(refs.make.id);
  await expect(page.getByLabel('Model')).toHaveValue(refs.model.id);

  await page.getByRole('link', { name: 'Next' }).click();
  await expect.poll(() => params().get('page')).toBe('2');
  expect(params().get('makeId')).toBe(refs.make.id);
  expect(params().get('limit')).toBe('2');
  await expect(rows.first()).toBeVisible();

  await page.reload();
  await expect(rows.first()).toBeVisible();
  expect(params().get('page')).toBe('2');
  expect(params().get('makeId')).toBe(refs.make.id);
  await expect(page.getByLabel('Model')).toHaveValue(refs.model.id);

  await page.getByLabel('Year').fill('2021');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => params().get('year')).toBe('2021');
  expect(params().get('page')).toBeNull();
  await expect(rows.first()).toContainText('2021');

  await page.getByLabel('Year').fill('1999');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No vehicles match these filters')).toBeVisible();

  await page.getByRole('link', { name: 'Clear filters' }).first().click();
  await expect.poll(() => params().get('year')).toBeNull();
  expect(params().get('makeId')).toBeNull();
  expect(params().get('modelId')).toBeNull();
  expect(params().get('limit')).toBe('2');

  await page.goto('/vehicles?page=abc&year=1800&makeId=toyota');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Some filters in the address were not valid and were ignored.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('the model filter follows the make and the type filter narrows the list', async ({
  page,
  request,
}) => {
  const vehicle = await createVehicleViaApi(request, adminToken, {
    refs,
    suffix,
  });
  await login(page, ADMIN);
  await page.goto('/vehicles');
  await expect(page.getByLabel('Model')).toBeDisabled();

  await page.getByLabel('Make').selectOption({ label: 'Ford' });
  await expect(page.getByLabel('Model')).toBeEnabled();
  await expect(
    page.getByLabel('Model').getByRole('option', { name: 'Corolla' }),
  ).toHaveCount(0);

  await page.getByLabel('Make').selectOption({ label: refs.make.name });
  await page
    .getByLabel('Vehicle type')
    .selectOption({ label: refs.vehicleType.name });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('makeId'))
    .toBe(refs.make.id);
  await expect(
    page.getByRole('row').filter({ hasText: vehicle.vin }),
  ).toBeVisible();

  // A different type excludes the vehicle.
  await page.getByLabel('Vehicle type').selectOption({ label: 'Bus' });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('vehicleTypeId'))
    .not.toBe(refs.vehicleType.id);
  await expect(
    page.getByRole('row').filter({ hasText: vehicle.vin }),
  ).toHaveCount(0);
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
