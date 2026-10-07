// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import type { FleetDashboard } from '@/lib/api/types';

const getFleetDashboard = vi.hoisted(() => vi.fn());
vi.mock('../_lib/dashboard-api', () => ({ getFleetDashboard }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));

import { FleetOverview } from './fleet-overview';

const stats: FleetDashboard = {
  asOf: '2026-10-08',
  vehicles: {
    total: 12,
    serviceStatus: { OK: 7, DUE_SOON: 2, OVERDUE: 1, UNKNOWN: 2 },
  },
  drivers: {
    total: 9,
    licenseStatus: { VALID: 6, EXPIRING_SOON: 2, EXPIRED: 1 },
  },
  assignments: { active: 5 },
};

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'secret internal detail',
    fieldErrors: {},
    requestId: 'req-42',
    path: '/p',
    body: undefined,
  });
}

async function renderSection() {
  render(await FleetOverview());
}

beforeEach(() => {
  getFleetDashboard.mockReset();
  getFleetDashboard.mockResolvedValue(stats);
});

describe('FleetOverview', () => {
  it('shows the counts from the API and the as-of caption', async () => {
    await renderSection();
    expect(screen.getByText('as of Oct 8, 2026')).toBeInTheDocument();
    const card = (name: string) =>
      screen.getByRole('heading', { name }).closest('div') as HTMLElement;
    expect(within(card('Vehicles')).getByText('12')).toBeInTheDocument();
    expect(
      within(card('Vehicles')).getByText('5 assigned'),
    ).toBeInTheDocument();
    expect(within(card('Drivers')).getByText('9')).toBeInTheDocument();
    expect(
      within(card('Active assignments')).getByText('5'),
    ).toBeInTheDocument();
    const service = within(card('Service'));
    for (const [label, count] of [
      ['Overdue', '1'],
      ['Due soon', '2'],
      ['No service date', '2'],
      ['OK', '7'],
    ]) {
      const row = service.getByRole('link', { name: label }).closest('li');
      expect(row).toHaveTextContent(count as string);
    }
    const licenses = within(card('Licenses'));
    expect(
      licenses.getByRole('link', { name: 'Expired' }).closest('li'),
    ).toHaveTextContent('1');
    expect(
      licenses
        .getByRole('link', { name: 'Expiring within 30 days' })
        .closest('li'),
    ).toHaveTextContent('2');
  });

  it('links every card to the page where it can be explored', async () => {
    await renderSection();
    const href = (name: string) =>
      screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Vehicles')).toBe('/vehicles');
    expect(href('Drivers')).toBe('/drivers');
    expect(href('Active assignments')).toBe('/assignments?active=true');
    expect(href('Overdue')).toBe('/vehicles?serviceStatus=OVERDUE');
    expect(href('Due soon')).toBe('/vehicles?serviceStatus=DUE_SOON');
    expect(href('No service date')).toBe('/vehicles?serviceStatus=UNKNOWN');
    expect(href('OK')).toBe('/vehicles?serviceStatus=OK');
    expect(href('Expired')).toBe('/drivers?licenseStatus=EXPIRED');
    expect(href('Expiring within 30 days')).toBe(
      '/drivers?licenseStatus=EXPIRING_SOON',
    );
  });

  it('shows an empty state with add links for an empty organization', async () => {
    getFleetDashboard.mockResolvedValue({
      ...stats,
      vehicles: {
        total: 0,
        serviceStatus: { OK: 0, DUE_SOON: 0, OVERDUE: 0, UNKNOWN: 0 },
      },
      drivers: {
        total: 0,
        licenseStatus: { VALID: 0, EXPIRING_SOON: 0, EXPIRED: 0 },
      },
      assignments: { active: 0 },
    });
    await renderSection();
    expect(
      screen.getByRole('heading', { name: 'Your fleet is empty' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add vehicle' })).toHaveAttribute(
      'href',
      '/vehicles/new',
    );
    expect(screen.getByRole('link', { name: 'Add driver' })).toHaveAttribute(
      'href',
      '/drivers/new',
    );
    expect(screen.queryByText(/as of/)).toBeNull();
  });

  it('keeps the cards when only one of vehicles and drivers is empty', async () => {
    getFleetDashboard.mockResolvedValue({
      ...stats,
      drivers: { ...stats.drivers, total: 0 },
    });
    await renderSection();
    expect(screen.queryByText('Your fleet is empty')).toBeNull();
  });

  it('shows NotAllowed on a 403', async () => {
    getFleetDashboard.mockRejectedValue(apiError(403));
    await renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows a generic error with the reference on a 5xx', async () => {
    getFleetDashboard.mockRejectedValue(apiError(503));
    await renderSection();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Fleet statistics are unavailable');
    expect(alert).toHaveTextContent('Reference: req-42');
    expect(alert).not.toHaveTextContent('secret internal detail');
  });

  it.each(['timeout', 'unreachable'] as const)(
    'shows a generic error on a %s connection error',
    async (reason) => {
      getFleetDashboard.mockRejectedValue(new ApiConnectionError(reason));
      await renderSection();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Fleet statistics are unavailable');
      expect(alert).not.toHaveTextContent('Reference');
    },
  );

  it('rethrows a redirect so the session redirect is not swallowed', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    getFleetDashboard.mockRejectedValue(redirect);
    await expect(FleetOverview()).rejects.toBe(redirect);
  });

  it('rethrows an unexpected error such as a 404', async () => {
    getFleetDashboard.mockRejectedValue(apiError(404));
    await expect(FleetOverview()).rejects.toBeInstanceOf(ApiError);
  });
});
