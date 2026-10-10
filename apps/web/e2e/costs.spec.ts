import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { formatMonth } from '../src/lib/format';
import {
  apiToken,
  catalogRefsViaApi,
  cleanupE2eFixtures,
  createMaintenanceRecordViaApi,
  createVehicleViaApi,
  isoDateFromToday,
  uniqueSuffix,
  type CatalogRefs,
} from './support/api';
import { midMonthDate, monthOf } from './support/dates';
import { signIn } from './support/session';
import { expectUrl } from './support/url';
import { ADMIN, DRIVER, MANAGER } from './support/users';

const NOT_ALLOWED = 'You are not allowed to do this.';

let suffix = '';
let adminToken = '';
let refs: CatalogRefs;

test.beforeEach(async ({ request }) => {
  suffix = uniqueSuffix();
  adminToken = await apiToken(request, ADMIN);
  refs = await catalogRefsViaApi(request, adminToken);
});

test.afterEach(async ({ request }) => {
  await cleanupE2eFixtures(request, adminToken, suffix);
});

async function login(page: Page, user: { email: string }) {
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL('/');
}

async function seedThisMonthCost(
  request: Parameters<typeof createVehicleViaApi>[0],
) {
  const vehicle = await createVehicleViaApi(request, adminToken, {
    refs,
    suffix,
  });
  await createMaintenanceRecordViaApi(request, adminToken, vehicle.id, {
    performedOn: isoDateFromToday(0),
    cost: '77.00',
  });
}

test('the range form updates the URL, the table and the chart', async ({
  page,
  request,
}) => {
  await seedThisMonthCost(request);
  const to = monthOf(isoDateFromToday(0));
  const from = monthOf(midMonthDate(-3));
  await login(page, ADMIN);

  await page.goto('/costs');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Costs' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Monthly costs' })).toBeVisible();
  await expect(page.getByLabel('To')).toHaveValue(to);
  await expect(page.locator('tbody tr')).toHaveCount(12);

  await page.getByLabel('From').fill(from);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expectUrl(page, '/costs', { from, to });
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(
    page.locator('tbody tr').last().getByRole('cell').first(),
  ).toHaveText(formatMonth(to));
  await expect(page.getByLabel('From')).toHaveValue(from);

  await page.getByRole('link', { name: 'Reset' }).click();
  await expectUrl(page, '/costs');
  await expect(page.locator('tbody tr')).toHaveCount(12);
});

test('a range over 24 months shows the API message and Reset recovers', async ({
  page,
  request,
}) => {
  await seedThisMonthCost(request);
  const to = monthOf(isoDateFromToday(0));
  const from = monthOf(midMonthDate(-24));
  await login(page, ADMIN);

  await page.goto('/costs');
  await page.getByLabel('From').fill(from);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expectUrl(page, '/costs', { from, to });

  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'This range could not be applied' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('The range must not exceed 24 months');
  await alert.getByRole('link', { name: 'Reset' }).click();
  await expectUrl(page, '/costs');
  await expect(page.getByRole('img', { name: 'Monthly costs' })).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test('a driver is not allowed on the fleet costs page', async ({ page }) => {
  await login(page, DRIVER);
  await page.goto('/costs');
  await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Monthly costs' })).toHaveCount(0);
});

for (const user of [ADMIN, MANAGER]) {
  test(`the Costs nav item opens the report for ${user.name}`, async ({
    page,
  }) => {
    await login(page, user);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Costs' })
      .click();
    await expect(page).toHaveURL('/costs');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Costs' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Costs' }),
    ).toHaveAttribute('aria-current', 'page');
  });
}
