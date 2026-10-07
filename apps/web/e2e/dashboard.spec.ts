import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { formatDecimal, formatMonth } from '../src/lib/format';
import {
  apiToken,
  cleanupE2eFixtures,
  createDriverViaApi,
  createMaintenanceRecordViaApi,
  createUserViaApi,
  createVehicleViaApi,
  fleetCostSummaryViaApi,
  fleetDashboardViaApi,
  isoDateFromToday,
  myDashboardViaApi,
  uniqueSuffix,
} from './support/api';
import { expectUrl } from './support/url';
import { signIn } from './support/session';
import { ADMIN, DRIVER, E2E_USER_PASSWORD, MANAGER } from './support/users';

const EMAIL_DOMAIN = 'acme-logistics.test';

let suffix = '';
let adminToken = '';

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
  adminToken = await apiToken(request, ADMIN);
});

test.afterEach(async ({ request }) => {
  await cleanupE2eFixtures(request, adminToken, suffix);
});

async function login(page: Page, user: { email: string }, password?: string) {
  await page.goto('/login');
  await signIn(page, user, password);
  await expect(page).toHaveURL('/');
}

const main = (page: Page) => page.locator('#main-content');

/** The card whose h3 is `label`: a number card or a list card. */
const card = (page: Page, label: string | RegExp) =>
  main(page)
    .getByRole('heading', { level: 3, name: label })
    .locator('xpath=..');

/** The row of a list card: the link plus its count. */
const listRow = (page: Page, label: string) =>
  main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: label, exact: true }) });

/** Gives the fleet costs section data for this month, so it is not empty. */
async function seedThisMonthCost(
  request: Parameters<typeof createVehicleViaApi>[0],
) {
  const vehicle = await createVehicleViaApi(request, adminToken, {
    make: `E2E-${suffix}`,
  });
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    performedOn: isoDateFromToday(0),
    cost: '123.45',
  });
  return vehicle;
}

async function expectFleetContent(
  page: Page,
  request: Parameters<typeof fleetDashboardViaApi>[0],
) {
  const stats = await fleetDashboardViaApi(request, adminToken);
  await expect(card(page, 'Vehicles')).toContainText(
    String(stats.vehicles.total),
  );
  await expect(card(page, 'Vehicles')).toContainText(
    `${stats.assignments.active} assigned`,
  );
  await expect(card(page, 'Drivers')).toContainText(
    String(stats.drivers.total),
  );
  await expect(card(page, 'Active assignments')).toContainText(
    String(stats.assignments.active),
  );
  const rows: [string, number][] = [
    ['Overdue', stats.vehicles.serviceStatus.OVERDUE],
    ['Due soon', stats.vehicles.serviceStatus.DUE_SOON],
    ['No service date', stats.vehicles.serviceStatus.UNKNOWN],
    ['OK', stats.vehicles.serviceStatus.OK],
    ['Expired', stats.drivers.licenseStatus.EXPIRED],
    ['Expiring within 30 days', stats.drivers.licenseStatus.EXPIRING_SOON],
  ];
  for (const [label, count] of rows) {
    await expect(listRow(page, label)).toHaveText(
      new RegExp(`^${label}\\s*${count}$`),
    );
  }
  await expect(main(page).getByText(/^as of /)).toBeVisible();
}

test('an admin sees the fleet numbers the API reports and the filtered links', async ({
  page,
  request,
}) => {
  await seedThisMonthCost(request);
  await login(page, ADMIN);
  await expectFleetContent(page, request);

  await expect(
    card(page, 'Active assignments').getByRole('link'),
  ).toHaveAttribute('href', '/assignments?active=true');
  await expect(listRow(page, 'Due soon').getByRole('link')).toHaveAttribute(
    'href',
    '/vehicles?serviceStatus=DUE_SOON',
  );
  await expect(
    listRow(page, 'No service date').getByRole('link'),
  ).toHaveAttribute('href', '/vehicles?serviceStatus=UNKNOWN');
  await expect(
    listRow(page, 'Expiring within 30 days').getByRole('link'),
  ).toHaveAttribute('href', '/drivers?licenseStatus=EXPIRING_SOON');

  await listRow(page, 'Overdue').getByRole('link').click();
  await expectUrl(page, '/vehicles', { serviceStatus: 'OVERDUE' });

  await page.goto('/');
  await listRow(page, 'Expired').getByRole('link').click();
  await expectUrl(page, '/drivers', { licenseStatus: 'EXPIRED' });

  await page.goto('/');
  await card(page, 'Active assignments').getByRole('link').click();
  await expectUrl(page, '/assignments', { active: 'true' });
});

test('the dashboard is not served from cache after the fleet changes', async ({
  page,
  request,
}) => {
  await login(page, ADMIN);
  const before = (await fleetDashboardViaApi(request, adminToken)).vehicles
    .total;
  await expect(card(page, 'Vehicles')).toContainText(String(before));

  await page
    .getByRole('link', { name: 'Vehicles', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL('/vehicles');
  await createVehicleViaApi(request, adminToken, { make: `E2E-${suffix}` });

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await expect(page).toHaveURL('/');
  await expect(card(page, 'Vehicles').locator('p').first()).toHaveText(
    String(before + 1),
  );
});

test('the costs section shows the chart, the data table and this month', async ({
  page,
  request,
}) => {
  await seedThisMonthCost(request);
  const summary = await fleetCostSummaryViaApi(request, adminToken);
  expect(summary.months).toHaveLength(12);
  const last = summary.months[11];
  const previous = summary.months[10];
  if (!last || !previous) throw new Error('summary has no months');

  await login(page, ADMIN);
  const chart = page.getByRole('img', { name: 'Monthly costs' });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAccessibleDescription(
    /Monthly maintenance and fuel costs.*The data table lists the values\./,
  );

  const thisMonth = card(page, /^This month/);
  await expect(thisMonth).toContainText(`(${formatMonth(last.month)})`);
  await expect(thisMonth).toContainText(formatDecimal(last.totalCost, 2));
  await expect(thisMonth).toContainText(
    `Maintenance ${formatDecimal(last.maintenanceCost, 2)}`,
  );
  await expect(card(page, /^Last month/)).toContainText(
    formatDecimal(previous.totalCost, 2),
  );

  const rows = page.locator('details tbody tr');
  await expect(rows.first()).toBeHidden();
  await page.getByText('Show data table').click();
  await expect(rows).toHaveCount(12);
  await expect(rows.last().getByRole('cell').first()).toHaveText(
    formatMonth(last.month),
  );
  await expect(rows.last().getByRole('cell').last()).toHaveText(
    formatDecimal(last.totalCost, 2),
  );

  await page.getByRole('link', { name: 'Open the cost report' }).click();
  await expect(page).toHaveURL('/costs');
});

test('a manager sees the same fleet content as an admin', async ({
  page,
  request,
}) => {
  await seedThisMonthCost(request);
  await login(page, MANAGER);
  await expectFleetContent(page, request);
  await expect(page.getByRole('img', { name: 'Monthly costs' })).toBeVisible();
  await expect(card(page, /^This month/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open the cost report' }),
  ).toBeVisible();
});

test('the seeded driver sees their vehicle and license and no fleet cards', async ({
  page,
  request,
}) => {
  const mine = await myDashboardViaApi(
    request,
    await apiToken(request, DRIVER),
  );
  expect(mine.driver).not.toBeNull();
  expect(mine.currentAssignment).not.toBeNull();
  await login(page, DRIVER);

  const vehicleCard = card(page, 'My vehicle');
  await expect(vehicleCard).toContainText(
    `${mine.currentAssignment?.vehicle.make} ${mine.currentAssignment?.vehicle.model}`,
  );
  await expect(vehicleCard.getByRole('link')).toHaveAttribute(
    'href',
    /^\/vehicles\/[0-9a-f-]{36}$/,
  );
  await expect(vehicleCard).toContainText(/Since /);
  const licenseCard = card(page, 'My license');
  await expect(licenseCard).toContainText(mine.driver?.licenseNumber ?? '');
  await expect(licenseCard).toContainText(/Expires /);
  // The badge text comes from the API's licenseStatus; a valid license has none.
  const badge: Record<string, string | undefined> = {
    EXPIRED: 'Expired',
    EXPIRING_SOON: 'Expires soon',
  };
  const expected = badge[mine.driver?.licenseStatus ?? 'VALID'];
  if (expected) {
    await expect(licenseCard).toContainText(expected);
  } else {
    await expect(licenseCard).not.toContainText(/Expired|Expires soon/);
  }

  await expect(
    page.getByRole('link', { name: 'Browse vehicles' }),
  ).toBeVisible();
  await expect(
    main(page).getByRole('heading', { name: 'Vehicles' }),
  ).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Fleet' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('img', { name: 'Monthly costs' })).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Costs' }),
  ).toHaveCount(0);
});

test('a driver account without a driver profile sees the not linked state', async ({
  page,
  request,
}) => {
  const user = await createUserViaApi(request, adminToken, {
    email: `e2e-${suffix.toLowerCase()}-1@${EMAIL_DOMAIN}`,
    role: 'DRIVER',
    firstName: `E2E-${suffix}`,
  });
  await login(page, user, E2E_USER_PASSWORD);
  await expect(
    page.getByText(
      'Your account is not linked to a driver profile. Ask an administrator.',
    ),
  ).toBeVisible();
  await expect(card(page, 'My license')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Browse vehicles' }),
  ).toBeVisible();
});

test('a linked driver without an assignment sees no vehicle', async ({
  page,
  request,
}) => {
  const user = await createUserViaApi(request, adminToken, {
    email: `e2e-${suffix.toLowerCase()}-1@${EMAIL_DOMAIN}`,
    role: 'DRIVER',
    firstName: `E2E-${suffix}`,
  });
  const license = `E2E-${suffix}-1`;
  await createDriverViaApi(request, adminToken, {
    firstName: `E2E-${suffix}`,
    licenseNumber: license,
    licenseExpiresOn: isoDateFromToday(10),
    userId: user.id,
  });
  await login(page, user, E2E_USER_PASSWORD);

  await expect(card(page, 'My vehicle')).toContainText(
    'No vehicle is assigned to you.',
  );
  const licenseCard = card(page, 'My license');
  await expect(licenseCard).toContainText(license);
  await expect(licenseCard).toContainText('Expires soon');
  await expect(
    page.getByRole('link', { name: 'Browse vehicles' }),
  ).toBeVisible();
});
