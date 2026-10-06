// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listDrivers = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('./_lib/drivers-api', () => ({ listDrivers }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));

import DriversPage from './page';

function driver(
  n: number,
  expires = '2099-01-01',
  userId: string | null = null,
) {
  return {
    id: `id-${n}`,
    firstName: `First${n}`,
    lastName: 'Driver',
    licenseNumber: `LIC-${n}`,
    licenseExpiresOn: expires,
    userId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'r',
    path: '/p',
    body: undefined,
  });
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    await DriversPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  listDrivers.mockReset();
  listDrivers.mockResolvedValue({
    data: [driver(1), driver(2, '2000-01-01', 'u2')],
    meta: { page: 1, limit: 20, total: 2 },
  });
});

describe('DriversPage', () => {
  it('renders rows with links, formatted expiry, badges and the account column', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'First1 Driver' })).toHaveAttribute(
      'href',
      '/drivers/id-1',
    );
    expect(screen.getByText('Jan 1, 2099')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2000')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add driver' })).toHaveAttribute(
      'href',
      '/drivers/new',
    );
  });

  it('shows NotAllowed to a driver without fetching', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(listDrivers).not.toHaveBeenCalled();
  });

  it('passes page and limit and warns about ignored params', async () => {
    await renderPage({ page: '2', limit: 'abc', notice: 'driver-created' });
    expect(listDrivers).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(screen.getByRole('alert')).toHaveTextContent(/were not valid/);
    expect(screen.getByRole('status')).toHaveTextContent('Driver created.');
  });

  it('shows the empty state when there are no drivers', async () => {
    listDrivers.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
    await renderPage();
    expect(screen.getByText('No drivers yet')).toBeInTheDocument();
  });

  it('shows the past-the-end state with a last-page link', async () => {
    listDrivers.mockResolvedValue({
      data: [],
      meta: { page: 9, limit: 20, total: 45 },
    });
    await renderPage({ page: '9' });
    expect(screen.getByText('No drivers on this page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', '/drivers?page=3');
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    listDrivers.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    listDrivers.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });
});
