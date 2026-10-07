// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import type { MyDashboard } from '@/lib/api/types';

const getMyDashboard = vi.hoisted(() => vi.fn());
vi.mock('../_lib/dashboard-api', () => ({ getMyDashboard }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));

import { DriverOverview } from './driver-overview';

const driver: NonNullable<MyDashboard['driver']> = {
  id: 'd1',
  firstName: 'Sam',
  lastName: 'Driver',
  licenseNumber: 'LIC-77',
  licenseExpiresOn: '2027-05-20',
  licenseStatus: 'VALID',
};

const currentAssignment: NonNullable<MyDashboard['currentAssignment']> = {
  id: 'a1',
  startedAt: '2026-06-15T10:00:00.000Z',
  vehicle: { id: 'v1', make: 'Ford', model: 'Transit', licensePlate: 'AB-1' },
};

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'req-3',
    path: '/p',
    body: undefined,
  });
}

beforeEach(() => {
  getMyDashboard.mockReset();
});

describe('DriverOverview', () => {
  it('explains an account without a driver profile and still offers Browse vehicles', async () => {
    getMyDashboard.mockResolvedValue({ driver: null, currentAssignment: null });
    render(await DriverOverview());
    expect(
      screen.getByText(
        'Your account is not linked to a driver profile. Ask an administrator.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse vehicles' }),
    ).toHaveAttribute('href', '/vehicles');
  });

  it('shows the license and "no vehicle" for a driver without an assignment', async () => {
    getMyDashboard.mockResolvedValue({ driver, currentAssignment: null });
    render(await DriverOverview());
    expect(
      screen.getByText('No vehicle is assigned to you.'),
    ).toBeInTheDocument();
    expect(screen.getByText('LIC-77')).toBeInTheDocument();
    expect(screen.getByText('Expires May 20, 2027')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse vehicles' }),
    ).toBeInTheDocument();
  });

  it('shows the vehicle card with a link, the plate and the start', async () => {
    getMyDashboard.mockResolvedValue({ driver, currentAssignment });
    render(await DriverOverview());
    const card = screen
      .getByRole('heading', { name: 'My vehicle' })
      .closest('div') as HTMLElement;
    expect(
      within(card).getByRole('link', { name: 'Ford Transit' }),
    ).toHaveAttribute('href', '/vehicles/v1');
    expect(within(card).getByText('AB-1')).toBeInTheDocument();
    expect(within(card).getByText(/Since Jun 15, 2026/)).toBeInTheDocument();
    expect(screen.queryByText('No vehicle is assigned to you.')).toBeNull();
  });

  it('omits the plate when the vehicle has none', async () => {
    getMyDashboard.mockResolvedValue({
      driver,
      currentAssignment: {
        ...currentAssignment,
        vehicle: { ...currentAssignment.vehicle, licensePlate: null },
      },
    });
    render(await DriverOverview());
    expect(screen.queryByText('AB-1')).toBeNull();
  });

  it.each([
    ['EXPIRED', 'Expired'],
    ['EXPIRING_SOON', 'Expires soon'],
  ] as const)(
    'shows the badge from the API status %s',
    async (status, text) => {
      getMyDashboard.mockResolvedValue({
        driver: { ...driver, licenseStatus: status },
        currentAssignment: null,
      });
      render(await DriverOverview());
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it('shows no badge for a valid license, whatever the date', async () => {
    getMyDashboard.mockResolvedValue({
      driver: { ...driver, licenseExpiresOn: '2000-01-01' },
      currentAssignment: null,
    });
    render(await DriverOverview());
    expect(screen.queryByText('Expired')).toBeNull();
    expect(screen.queryByText('Expires soon')).toBeNull();
  });

  it('shows NotAllowed on a 403', async () => {
    getMyDashboard.mockRejectedValue(apiError(403));
    render(await DriverOverview());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows a generic error on a 5xx or a connection error', async () => {
    getMyDashboard.mockRejectedValueOnce(apiError(500));
    render(await DriverOverview());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your overview is unavailable',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req-3');
    document.body.innerHTML = '';
    getMyDashboard.mockRejectedValueOnce(new ApiConnectionError('unreachable'));
    render(await DriverOverview());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your overview is unavailable',
    );
  });

  it('rethrows a redirect', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    getMyDashboard.mockRejectedValue(redirect);
    await expect(DriverOverview()).rejects.toBe(redirect);
  });
});
