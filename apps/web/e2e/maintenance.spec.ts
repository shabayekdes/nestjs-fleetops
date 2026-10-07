import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  cleanupE2eFixtures,
  createMaintenanceRecordViaApi,
  createVehicleViaApi,
  isoDateFromToday,
  listMaintenanceRecordsViaApi,
  uniqueSuffix,
} from './support/api';
import { fmtDate } from './support/dates';
import { expectUrl } from './support/url';
import { signIn } from './support/session';
import { ADMIN, DRIVER, MANAGER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// Every vehicle a test creates has the make `E2E-<suffix>`.
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

async function fillRecordForm(
  page: Page,
  values: {
    type?: string;
    performedOn?: string;
    cost?: string;
    vendor?: string;
    description?: string;
    nextServiceDueOn?: string;
  },
) {
  if (values.type) await page.getByLabel('Type').selectOption(values.type);
  if (values.performedOn !== undefined) {
    await page.getByLabel('Date performed').fill(values.performedOn);
  }
  if (values.cost !== undefined)
    await page.getByLabel('Cost').fill(values.cost);
  if (values.vendor !== undefined) {
    await page.getByLabel('Vendor').fill(values.vendor);
  }
  if (values.description !== undefined) {
    await page.getByLabel('Description').fill(values.description);
  }
  if (values.nextServiceDueOn !== undefined) {
    await page.getByLabel('Next service due').fill(values.nextServiceDueOn);
  }
}

const dataRows = (page: Page) => page.locator('tbody tr');

test('an admin adds a record that makes the vehicle due soon', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const today = isoDateFromToday(0);
  const due = isoDateFromToday(5);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/maintenance`);
  await expect(page.getByText('No maintenance records yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add record' }).first().click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/maintenance/new`);

  await fillRecordForm(page, {
    type: 'OIL_CHANGE',
    performedOn: today,
    cost: '1234.50',
    vendor: 'Quick Lube',
    nextServiceDueOn: due,
  });
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/maintenance?notice=maintenance-created`,
  );
  await expect(page.getByRole('status')).toContainText(
    'Maintenance record added.',
  );
  const row = page.getByRole('row', { name: /Oil change/ });
  await expect(row).toContainText(fmtDate(today));
  await expect(row).toContainText('Quick Lube');
  await expect(row).toContainText('1,234.50');
  await expect(row).toContainText(fmtDate(due));

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(page.locator('dd', { hasText: fmtDate(due) })).toBeVisible();
  await expect(page.locator('dd').getByText('Due soon')).toBeVisible();
});

test('an admin edits a record and clears the vendor', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const performedOn = isoDateFromToday(-20);
  const record = await createMaintenanceRecordViaApi(
    request,
    adminToken,
    vehicle.id,
    { performedOn, cost: '10.00', vendor: 'Acme Garage', description: 'First' },
  );
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/maintenance`);
  await page
    .getByRole('link', { name: `Edit Oil change on ${fmtDate(performedOn)}` })
    .click();
  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/maintenance/${record.id}/edit`,
  );
  await expect(page.getByLabel('Vendor')).toHaveValue('Acme Garage');
  await page.getByLabel('Cost').fill('25.5');
  await page.getByLabel('Vendor').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/maintenance?notice=maintenance-updated`,
  );
  await expect(page.getByRole('status')).toContainText(
    'Maintenance record updated.',
  );
  await expect(page.getByRole('row', { name: /Oil change/ })).toContainText(
    '25.50',
  );

  const [updated] = await listMaintenanceRecordsViaApi(
    request,
    adminToken,
    vehicle.id,
  );
  expect(updated).toMatchObject({
    id: record.id,
    vendor: null,
    cost: '25.50',
    description: 'First',
  });
});

test('an admin deletes a record after confirming', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const performedOn = isoDateFromToday(-2);
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    performedOn,
    nextServiceDueOn: isoDateFromToday(5),
  });
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(page.locator('dd').getByText('Due soon')).toBeVisible();

  await page.goto(`/vehicles/${vehicle.id}/maintenance`);
  await page
    .getByRole('button', {
      name: `Delete Oil change on ${fmtDate(performedOn)}`,
    })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this maintenance record?');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/maintenance?notice=maintenance-deleted`,
  );
  await expect(page.getByRole('status')).toContainText(
    'Maintenance record deleted.',
  );
  await expect(page.getByText('No maintenance records yet')).toBeVisible();
  expect(
    await listMaintenanceRecordsViaApi(request, adminToken, vehicle.id),
  ).toHaveLength(0);

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(page.locator('dd').getByText('No service date')).toBeVisible();
});

test('a record due yesterday lists the vehicle as overdue', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    performedOn: isoDateFromToday(-30),
    nextServiceDueOn: isoDateFromToday(-1),
  });
  await login(page, ADMIN);

  const make = `E2E-${suffix}`;
  await page.goto(`/vehicles?make=${make}&serviceStatus=OVERDUE`);
  await expect(page.getByLabel('Service')).toHaveValue('OVERDUE');
  const row = page.getByRole('row', { name: new RegExp(make) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Overdue');
  await expect(row).toContainText(fmtDate(isoDateFromToday(-1)));

  await page.goto(`/vehicles?make=${make}&serviceStatus=OK`);
  await expect(page.getByText('No vehicles match these filters')).toBeVisible();
});

test('a due date before the service date shows the API message', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const today = isoDateFromToday(0);
  const due = isoDateFromToday(-3);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/maintenance/new`);
  await fillRecordForm(page, {
    type: 'REPAIR',
    performedOn: today,
    cost: '50.00',
    vendor: 'Kept Vendor',
    nextServiceDueOn: due,
  });
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(
    page.getByText('nextServiceDueOn must be after performedOn'),
  ).toBeVisible();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/maintenance/new`);
  await expect(page.getByLabel('Type')).toHaveValue('REPAIR');
  await expect(page.getByLabel('Date performed')).toHaveValue(today);
  await expect(page.getByLabel('Cost')).toHaveValue('50.00');
  await expect(page.getByLabel('Vendor')).toHaveValue('Kept Vendor');
  await expect(page.getByLabel('Next service due')).toHaveValue(due);
  expect(
    await listMaintenanceRecordsViaApi(request, adminToken, vehicle.id),
  ).toHaveLength(0);
});

test('a cost with three decimals is rejected on the form', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/maintenance/new`);
  await fillRecordForm(page, {
    type: 'TIRES',
    performedOn: isoDateFromToday(0),
    cost: '12.345',
  });
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page.getByText('Enter an amount such as 89.90')).toBeVisible();
  await expect(page.getByLabel('Cost')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Cost')).toHaveValue('12.345');
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/maintenance/new`);
  expect(
    await listMaintenanceRecordsViaApi(request, adminToken, vehicle.id),
  ).toHaveLength(0);
});

test('the filters stay in the URL and an invalid range shows an error', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const a = isoDateFromToday(-30);
  const b = isoDateFromToday(-20);
  const c = isoDateFromToday(-10);
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    type: 'OIL_CHANGE',
    performedOn: a,
  });
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    type: 'TIRES',
    performedOn: b,
  });
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    type: 'OIL_CHANGE',
    performedOn: c,
  });
  await login(page, ADMIN);
  const list = `/vehicles/${vehicle.id}/maintenance`;

  // Type filter.
  await page.goto(list);
  await expect(dataRows(page)).toHaveCount(3);
  await page.getByLabel('Type').selectOption('TIRES');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expectUrl(page, list, { type: 'TIRES' });
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText(fmtDate(b));
  await expect(page.getByLabel('Type')).toHaveValue('TIRES');

  // Date range filter.
  await page.getByLabel('Type').selectOption('');
  await page.getByLabel('From').fill(isoDateFromToday(-25));
  await page.getByLabel('To').fill(isoDateFromToday(-15));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expectUrl(page, list, {
    from: isoDateFromToday(-25),
    to: isoDateFromToday(-15),
  });
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText(fmtDate(b));
  await expect(page.getByLabel('From')).toHaveValue(isoDateFromToday(-25));
  await expect(page.getByLabel('To')).toHaveValue(isoDateFromToday(-15));

  // No match.
  await page.goto(`${list}?from=${isoDateFromToday(-5)}`);
  await expect(
    page.getByText('No maintenance records match these filters'),
  ).toBeVisible();

  // Pagination keeps the filters.
  await page.goto(`${list}?type=OIL_CHANGE&limit=1`);
  await expect(dataRows(page)).toHaveCount(1);
  await expect(page.getByText('Showing 1–1 of 2')).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/type=OIL_CHANGE/);
  await expect(page).toHaveURL(/limit=1/);
  await expect(page.getByText('Showing 2–2 of 2')).toBeVisible();
  await expect(page.getByLabel('Type')).toHaveValue('OIL_CHANGE');

  // from after to: the API's 400 is shown.
  await page.goto(
    `${list}?from=${isoDateFromToday(0)}&to=${isoDateFromToday(-5)}`,
  );
  const alert = page.getByRole('alert').filter({
    hasText: 'These filters could not be applied',
  });
  await expect(alert).toBeVisible();
  await expect(alert.locator('p').first()).not.toBeEmpty();
  await alert.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(list);
  await expect(dataRows(page)).toHaveCount(3);
});

test('a manager adds a record', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  await login(page, MANAGER);

  await page.goto(`/vehicles/${vehicle.id}/maintenance/new`);
  await fillRecordForm(page, {
    type: 'INSPECTION',
    performedOn: isoDateFromToday(-1),
    cost: '40',
    description: 'Manager inspection',
  });
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Maintenance record added.',
  );
  await expect(page.getByRole('row', { name: /Inspection/ })).toContainText(
    'Manager inspection',
  );
  const [created] = await listMaintenanceRecordsViaApi(
    request,
    adminToken,
    vehicle.id,
  );
  expect(created).toMatchObject({ type: 'INSPECTION', cost: '40.00' });
});

test('a driver sees the service status but not the maintenance pages', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const record = await createMaintenanceRecordViaApi(
    request,
    adminToken,
    vehicle.id,
    {
      performedOn: isoDateFromToday(-2),
      nextServiceDueOn: isoDateFromToday(5),
    },
  );
  await login(page, DRIVER);

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(page.locator('dd').getByText('Due soon')).toBeVisible();
  await expect(
    page.locator('dd', { hasText: fmtDate(isoDateFromToday(5)) }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Vehicle sections' }),
  ).toHaveCount(0);

  for (const path of [
    '/maintenance',
    '/maintenance/new',
    `/maintenance/${record.id}/edit`,
  ]) {
    await page.goto(`/vehicles/${vehicle.id}${path}`);
    await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Cost')).toHaveCount(0);
  }
});

test('unknown vehicles and records show not found pages', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${UNKNOWN_ID}/maintenance`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();

  await page.goto(`/vehicles/${UNKNOWN_ID}/maintenance/new`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();

  await page.goto(`/vehicles/not-a-uuid/maintenance`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();

  await page.goto(`/vehicles/${vehicle.id}/maintenance/${UNKNOWN_ID}/edit`);
  await expect(page.getByText('Maintenance record not found')).toBeVisible();

  await page.goto(`/vehicles/${vehicle.id}/maintenance/not-a-uuid/edit`);
  await expect(page.getByText('Maintenance record not found')).toBeVisible();
});
