import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiToken,
  cleanupE2eFixtures,
  createAssignmentViaApi,
  createDriverViaApi,
  createVehicleViaApi,
  endAssignmentViaApi,
  findDriverByLicenseViaApi,
  isoDateFromToday,
  listAssignmentsViaApi,
  uniqueSuffix,
} from './support/api';
import { signIn } from './support/session';
import { ADMIN, DRIVER, MANAGER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';

// Naming: driver firstName `E2E-<suffix>`, licenseNumber `E2E-<SUFFIX>-<n>`,
// vehicle make `E2E-<suffix>`, so the cleanup can find everything.
let suffix = '';
let counter = 0;
let adminToken = '';

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

function newDriver(
  request: Parameters<typeof createDriverViaApi>[0],
  licenseExpiresOn?: string,
) {
  counter += 1;
  return createDriverViaApi(request, adminToken, {
    firstName: `E2E-${suffix}`,
    licenseNumber: `E2E-${suffix}-${counter}`,
    licenseExpiresOn,
  });
}

function newVehicle(request: Parameters<typeof createVehicleViaApi>[0]) {
  return createVehicleViaApi(request, adminToken, { make: `E2E-${suffix}` });
}

const assignButton = (page: Page) =>
  page.getByRole('button', { name: 'Assign', exact: true });

test('a manager assigns, ends and sees the history', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const driver = await newDriver(request);
  await login(page, MANAGER);

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(page.getByText('No driver assigned.')).toBeVisible();
  await page.getByLabel('Driver', { exact: true }).selectOption(driver.id);
  await assignButton(page).click();

  await expect(page).toHaveURL(
    `/vehicles/${vehicle.id}?notice=assignment-created`,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('status')).toContainText('Driver assigned.', {
    timeout: 15_000,
  });
  await expect(
    page.getByRole('link', { name: `E2E-${suffix} Fixture` }),
  ).toBeVisible();
  await expect(page.getByText(/^Since /)).toBeVisible();

  // The driver page shows the vehicle as current.
  await page.goto(`/drivers/${driver.id}`);
  await expect(
    page.getByRole('link', { name: `E2E-${suffix} E2E Model` }),
  ).toBeVisible();

  // The assignments page lists it as current.
  await page.goto('/assignments?active=true');
  const row = page.getByRole('row').filter({ hasText: `E2E-${suffix}` });
  await expect(row).toContainText('Current');

  // End it from the driver page.
  await page.goto(`/drivers/${driver.id}`);
  await page.getByRole('button', { name: 'End assignment' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('End this assignment?');
  await dialog.getByRole('button', { name: 'End assignment' }).click();
  await expect(page).toHaveURL(
    `/drivers/${driver.id}?notice=assignment-ended`,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('status')).toContainText('Assignment ended.', {
    timeout: 15_000,
  });
  await expect(page.getByText('No vehicle assigned.')).toBeVisible();

  // The past tables on both pages show Started and Ended.
  const past = page.getByRole('table', { name: 'Past assignments' });
  await expect(past.getByRole('row').nth(1)).toContainText(/UTC.*UTC/);
  await page.goto(`/vehicles/${vehicle.id}`);
  const vehiclePast = page.getByRole('table', { name: 'Past assignments' });
  await expect(vehiclePast).toContainText(`E2E-${suffix} Fixture`);
  await expect(vehiclePast.getByRole('row').nth(1)).toContainText(/UTC.*UTC/);

  await page.goto('/assignments?active=false');
  const endedRow = page.getByRole('row').filter({ hasText: `E2E-${suffix}` });
  await expect(endedRow).toBeVisible();
  await expect(endedRow).not.toContainText('Current');
});

test('a vehicle is assigned from the driver page', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const driver = await newDriver(request);
  await login(page, ADMIN);
  await page.goto(`/drivers/${driver.id}`);
  await page.getByLabel('Vehicle', { exact: true }).selectOption(vehicle.id);
  await assignButton(page).click();

  await expect(page).toHaveURL(
    `/drivers/${driver.id}?notice=assignment-created`,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('status')).toContainText('Driver assigned.', {
    timeout: 15_000,
  });
  await expect(
    page.getByRole('link', { name: `E2E-${suffix} E2E Model` }),
  ).toBeVisible();
  const active = await listAssignmentsViaApi(request, adminToken, {
    driverId: driver.id,
    active: true,
  });
  expect(active).toHaveLength(1);
});

test('one active driver per vehicle and one active vehicle per driver', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const vehicle2 = await newVehicle(request);
  const driver1 = await newDriver(request);
  const driver2 = await newDriver(request);
  await createAssignmentViaApi(request, adminToken, {
    vehicleId: vehicle.id,
    driverId: driver1.id,
  });
  await login(page, MANAGER);

  // D2 cannot take V.
  await page.goto(`/drivers/${driver2.id}`);
  await page.getByLabel('Vehicle', { exact: true }).selectOption(vehicle.id);
  await assignButton(page).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Vehicle already has an active assignment' }),
  ).toBeVisible();
  await expect(page.getByText('No vehicle assigned.')).toBeVisible();

  // D1 cannot take V2.
  await page.goto(`/vehicles/${vehicle2.id}`);
  await page.getByLabel('Driver', { exact: true }).selectOption(driver1.id);
  await assignButton(page).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Driver already has an active assignment' }),
  ).toBeVisible();

  // V's page has no assign form, only the hint.
  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(assignButton(page)).toHaveCount(0);
  await expect(
    page.getByText('End the current assignment to assign another driver.'),
  ).toBeVisible();
});

test('an expired license is labelled but the API refuses the assignment', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const expired = await newDriver(request, isoDateFromToday(-3));
  await login(page, MANAGER);

  await page.goto(`/vehicles/${vehicle.id}`);
  await expect(
    page
      .getByRole('option', { name: /E2E-.* Fixture \(.*\) — license expired/ })
      .first(),
  ).toBeAttached();
  await expect(assignButton(page)).toBeEnabled();
  await page.getByLabel('Driver', { exact: true }).selectOption(expired.id);
  await assignButton(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Driver license has expired' }),
  ).toBeVisible();
  expect(
    await listAssignmentsViaApi(request, adminToken, { driverId: expired.id }),
  ).toHaveLength(0);

  // The driver's own page warns, and submitting gives the same answer.
  await page.goto(`/drivers/${expired.id}`);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /New assignments will be refused/ }),
  ).toBeVisible();
  await expect(assignButton(page)).toBeEnabled();
  await page.getByLabel('Vehicle', { exact: true }).selectOption(vehicle.id);
  await assignButton(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Driver license has expired' }),
  ).toBeVisible();
  expect(
    await listAssignmentsViaApi(request, adminToken, { driverId: expired.id }),
  ).toHaveLength(0);
});

test('ending an assignment that was already ended shows the API message', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const driver = await newDriver(request);
  const assignment = await createAssignmentViaApi(request, adminToken, {
    vehicleId: vehicle.id,
    driverId: driver.id,
  });
  await login(page, MANAGER);
  await page.goto(`/drivers/${driver.id}`);
  await page.getByRole('button', { name: 'End assignment' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();

  await endAssignmentViaApi(request, adminToken, assignment.id);
  await dialog.getByRole('button', { name: 'End assignment' }).click();
  await expect(dialog).toContainText('Assignment has already ended');
});

test('a history page past the end links back to the last page', async ({
  page,
  request,
}) => {
  const vehicle = await newVehicle(request);
  const driver = await newDriver(request);
  const assignment = await createAssignmentViaApi(request, adminToken, {
    vehicleId: vehicle.id,
    driverId: driver.id,
  });
  await endAssignmentViaApi(request, adminToken, assignment.id);
  await login(page, MANAGER);

  await page.goto(`/vehicles/${vehicle.id}?assignmentsPage=99`);
  await expect(page.getByText('No assignments on this page')).toBeVisible();
  await page.getByRole('link', { name: 'Go to the last page' }).click();
  await expect(page).toHaveURL(`/vehicles/${vehicle.id}`, { timeout: 15_000 });
  await expect(
    page.getByRole('table', { name: 'Past assignments' }),
  ).toBeVisible();
});

test('a driver sees no assignment pages or sections', async ({
  page,
  request,
}) => {
  const samSeed = await findDriverByLicenseViaApi(
    request,
    adminToken,
    'DL-1001',
  );
  if (!samSeed) throw new Error('seed driver DL-1001 not found');
  await login(page, DRIVER);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Vehicles' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Drivers' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Assignments' })).toHaveCount(0);

  for (const path of [
    '/drivers',
    '/drivers/new',
    `/drivers/${samSeed.id}`,
    '/assignments',
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('alert').filter({ hasText: NOT_ALLOWED }),
    ).toBeVisible();
  }

  // The seed Ford Transit page renders without an Assignment section.
  await page.goto('/vehicles?make=Ford');
  await page
    .getByRole('row')
    .filter({ hasText: '1FTBW3XM5PKA00001' })
    .getByRole('link')
    .click();
  await expect(page.getByText('1FTBW3XM5PKA00001')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Assignment', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'End assignment' }),
  ).toHaveCount(0);
});
