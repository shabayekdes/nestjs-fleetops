import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  cleanupE2eFixtures,
  createFuelLogViaApi,
  createVehicleViaApi,
  isoDateFromToday,
  listFuelLogsViaApi,
  uniqueSuffix,
} from './support/api';
import { fmtDate } from './support/dates';
import { expectUrl } from './support/url';
import { signIn } from './support/session';
import { ADMIN, DRIVER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let suffix = '';
let adminToken = '';

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
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

function newVehicle(request: Parameters<typeof createVehicleViaApi>[0]) {
  return createVehicleViaApi(request, adminToken, { make: `E2E-${suffix}` });
}

const dataRows = (page: Page) => page.locator('tbody tr');

test('an admin adds a fuel log', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  const today = isoDateFromToday(0);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/fuel`);
  await expect(page.getByText('No fuel logs yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add fuel log' }).first().click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/fuel/new`);

  await page.getByLabel('Date').fill(today);
  await page.getByLabel('Liters').fill('45.5');
  await page.getByLabel('Total cost').fill('1234.5');
  await page.getByLabel('Odometer (km)').fill('120000');
  await page.getByRole('button', { name: 'Add fuel log' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/fuel?notice=fuel-log-created`,
  );
  await expect(page.getByRole('status')).toContainText('Fuel log added.');
  const row = dataRows(page).first();
  await expect(row).toContainText(fmtDate(today));
  await expect(row).toContainText('45.500');
  await expect(row).toContainText('1,234.50');
  await expect(row).toContainText('120,000 km');
});

test('an admin edits a fuel log', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  const fueledOn = isoDateFromToday(-12);
  const log = await createFuelLogViaApi(request, adminToken, vehicle.id, {
    fueledOn,
    liters: '40.000',
    totalCost: '60.00',
    odometerKm: 5000,
  });
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/fuel`);
  await expect(dataRows(page).first()).toContainText('40.000');
  await page
    .getByRole('link', { name: `Edit Fuel log of ${fmtDate(fueledOn)}` })
    .click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/fuel/${log.id}/edit`);
  await expect(page.getByLabel('Liters')).toHaveValue('40.000');
  await page.getByLabel('Liters').fill('45.5');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/fuel?notice=fuel-log-updated`,
  );
  await expect(page.getByRole('status')).toContainText('Fuel log updated.');
  await expect(dataRows(page).first()).toContainText('45.500');

  const [updated] = await listFuelLogsViaApi(request, adminToken, vehicle.id);
  expect(updated).toMatchObject({
    id: log.id,
    liters: '45.500',
    totalCost: '60.00',
    odometerKm: 5000,
  });
});

test('an admin deletes a fuel log after confirming', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const fueledOn = isoDateFromToday(-3);
  await createFuelLogViaApi(request, adminToken, vehicle.id, { fueledOn });
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/fuel`);
  await page
    .getByRole('button', { name: `Delete Fuel log of ${fmtDate(fueledOn)}` })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/fuel?notice=fuel-log-deleted`,
  );
  await expect(page.getByRole('status')).toContainText('Fuel log deleted.');
  await expect(page.getByText('No fuel logs yet')).toBeVisible();
  expect(
    await listFuelLogsViaApi(request, adminToken, vehicle.id),
  ).toHaveLength(0);
});

test('the date filter stays in the URL and Clear filters resets it', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const old = isoDateFromToday(-30);
  const recent = isoDateFromToday(-5);
  await createFuelLogViaApi(request, adminToken, vehicle.id, {
    fueledOn: old,
    liters: '11.000',
  });
  await createFuelLogViaApi(request, adminToken, vehicle.id, {
    fueledOn: recent,
    liters: '22.000',
  });
  await login(page, ADMIN);
  const list = `/vehicles/${vehicle.id}/fuel`;

  await page.goto(list);
  await expect(dataRows(page)).toHaveCount(2);
  await page.getByLabel('From').fill(isoDateFromToday(-10));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expectUrl(page, list, { from: isoDateFromToday(-10) });
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText(fmtDate(recent));
  await expect(page.getByLabel('From')).toHaveValue(isoDateFromToday(-10));

  await page.goto(`${list}?to=${isoDateFromToday(-40)}`);
  await expect(
    page.getByText('No fuel logs match these filters'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).first().click();
  await expect(page).toHaveURL(list);
  await expect(dataRows(page)).toHaveCount(2);
});

test('zero liters is rejected on the form', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/fuel/new`);
  await page.getByLabel('Date').fill(isoDateFromToday(0));
  await page.getByLabel('Liters').fill('0');
  await page.getByLabel('Total cost').fill('10.00');
  await page.getByRole('button', { name: 'Add fuel log' }).click();

  await expect(page.getByText('Enter more than 0 liters')).toBeVisible();
  await expect(page.getByLabel('Liters')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Liters')).toHaveValue('0');
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/fuel/new`);
  expect(
    await listFuelLogsViaApi(request, adminToken, vehicle.id),
  ).toHaveLength(0);
});

test('a driver is not allowed on the fuel pages', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  const log = await createFuelLogViaApi(request, adminToken, vehicle.id);
  await login(page, DRIVER);

  for (const path of ['/fuel', '/fuel/new', `/fuel/${log.id}/edit`]) {
    await page.goto(`/vehicles/${vehicle.id}${path}`);
    await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Liters')).toHaveCount(0);
  }
});

test('unknown vehicles and fuel logs show not found pages', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${UNKNOWN_ID}/fuel`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();
  await page.goto(`/vehicles/not-a-uuid/fuel/new`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();
  await page.goto(`/vehicles/${vehicle.id}/fuel/${UNKNOWN_ID}/edit`);
  await expect(page.getByText('Fuel log not found')).toBeVisible();
  await page.goto(`/vehicles/${vehicle.id}/fuel/not-a-uuid/edit`);
  await expect(page.getByText('Fuel log not found')).toBeVisible();
});
