import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  cleanupE2eFixtures,
  createFuelLogViaApi,
  createMaintenanceRecordViaApi,
  createVehicleViaApi,
  isoDateFromToday,
  uniqueSuffix,
} from './support/api';
import { midMonthDate, monthOf } from './support/dates';
import { signIn } from './support/session';
import { ADMIN, DRIVER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';

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

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));

test('the summary shows both months and the totals', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const thisMonth = monthOf(isoDateFromToday(0));
  const prevMonth = monthOf(midMonthDate(-1));
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    performedOn: isoDateFromToday(0),
    cost: '1200.50',
  });
  await createFuelLogViaApi(request, adminToken, vehicle.id, {
    fueledOn: midMonthDate(-1),
    liters: '45.500',
    totalCost: '80.25',
  });
  await login(page, ADMIN);

  await page.goto(
    `/vehicles/${vehicle.id}/costs?from=${prevMonth}&to=${thisMonth}`,
  );
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByLabel('From')).toHaveValue(prevMonth);
  await expect(page.getByLabel('To')).toHaveValue(thisMonth);

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('cell')).toHaveText([
    monthLabel(prevMonth),
    '0.00',
    '80.25',
    '45.500',
    '80.25',
  ]);
  await expect(rows.nth(1).getByRole('cell')).toHaveText([
    monthLabel(thisMonth),
    '1,200.50',
    '0.00',
    '0.000',
    '1,200.50',
  ]);
  const footer = page.locator('tfoot tr');
  await expect(footer.getByRole('cell')).toHaveText([
    '1,200.50',
    '80.25',
    '45.500',
    '1,280.75',
  ]);

  // Apply with the range form keeps working.
  await page.getByLabel('From').fill(thisMonth);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}/costs?from=${thisMonth}&to=${thisMonth}`,
  );
  await expect(rows).toHaveCount(1);
  await page.getByRole('link', { name: 'Reset' }).click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/costs`);
});

test('a vehicle without records shows the empty state', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/costs`);
  await expect(
    page.getByText('No costs recorded in this period'),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('a range of 25 months shows the API message', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const to = monthOf(isoDateFromToday(0));
  const from = monthOf(midMonthDate(-24));
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/costs?from=${from}&to=${to}`);
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'This range could not be applied' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('The range must not exceed 24 months');
  await alert.getByRole('link', { name: 'Reset' }).click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}/costs`);
  await expect(
    page.getByText('No costs recorded in this period'),
  ).toBeVisible();
});

test('an invalid from is ignored with a warning', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  await login(page, ADMIN);

  await page.goto(`/vehicles/${vehicle.id}/costs?from=2026-13`);
  await expect(
    page.getByText(
      'Some values in the address were not valid and were ignored.',
    ),
  ).toBeVisible();
  // The default range is used: both month inputs are filled by the API range.
  await expect(page.getByLabel('From')).toHaveValue(/^\d{4}-\d{2}$/);
  await expect(page.getByLabel('To')).toHaveValue(monthOf(isoDateFromToday(0)));
  await expect(
    page.getByText('No costs recorded in this period'),
  ).toBeVisible();
});

test('a driver is not allowed on the costs page', async ({ page, request }) => {
  const vehicle = await newVehicle(request);
  await login(page, DRIVER);

  await page.goto(`/vehicles/${vehicle.id}/costs`);
  await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Vehicle sections' }),
  ).toHaveCount(0);
});
