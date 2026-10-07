// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listFuelLogs = vi.hoisted(() => vi.fn());
const loadVehicle = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('./_lib/fuel-api', () => ({ listFuelLogs }));
vi.mock('../../_lib/load-vehicle', () => ({ loadVehicle }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('./actions', () => ({ deleteFuelLog: vi.fn() }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/form', () => ({
  default: ({
    action,
    children,
    ...rest
  }: {
    action: string;
    children: ReactNode;
  }) => (
    <form action={action} {...rest}>
      {children}
    </form>
  ),
}));

import FuelPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const vehicle = { id: ID, make: 'Ford', model: 'Transit' };

function log(n: number) {
  return {
    id: `log-${n}`,
    vehicleId: ID,
    fueledOn: '2026-01-15',
    liters: '45.500',
    totalCost: '1234.50',
    odometerKm: null,
    createdAt: '',
    updatedAt: '',
  };
}

function listResult(count: number, total = count, page = 1, limit = 20) {
  return {
    data: Array.from({ length: count }, (_, i) => log(i + 1)),
    meta: { page, limit, total },
  };
}

function apiError(status: number, message = 'm') {
  return new ApiError({
    status,
    error: 'E',
    message,
    fieldErrors: {},
    requestId: 'req-1',
    path: '/p',
    body: undefined,
  });
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {},
  id: string = ID,
) {
  render(
    await FuelPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  loadVehicle.mockReset();
  loadVehicle.mockResolvedValue({ kind: 'ok', vehicle });
  listFuelLogs.mockReset();
  listFuelLogs.mockResolvedValue(listResult(2));
});

describe('FuelPage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Fuel' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(listFuelLogs).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(renderPage({}, 'nope')).rejects.toThrow('NOT_FOUND');
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(listFuelLogs).not.toHaveBeenCalled();
  });

  it('calls notFound when the list answers 404', async () => {
    listFuelLogs.mockRejectedValue(apiError(404));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed when forbidden and rethrows a 500', async () => {
    loadVehicle.mockResolvedValueOnce({ kind: 'forbidden' });
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    document.body.innerHTML = '';
    listFuelLogs.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    listFuelLogs.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('shows the API message for a 400 with a Clear filters link', async () => {
    listFuelLogs.mockRejectedValue(apiError(400, 'from must not be after to'));
    await renderPage({ from: '2026-05-01', to: '2026-01-01' });
    expect(
      screen.getByRole('heading', {
        name: 'These filters could not be applied',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('from must not be after to')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/fuel`,
    );
  });

  it('renders the header, nav and formatted rows', async () => {
    await renderPage();
    expect(screen.getByText('Ford Transit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add fuel log' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/fuel/new`,
    );
    expect(screen.getByRole('link', { name: 'Fuel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByText('1,234.50')).toHaveLength(2);
    expect(screen.getAllByText('45.500')).toHaveLength(2);
  });

  it('passes the parsed query to the API', async () => {
    await renderPage({ page: '2', limit: '5', from: '2026-01-01', type: 'x' });
    expect(listFuelLogs).toHaveBeenCalledWith(ID, {
      page: 2,
      limit: 5,
      from: '2026-01-01',
    });
  });

  it('shows the three empty states', async () => {
    listFuelLogs.mockResolvedValue(listResult(0));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No fuel logs yet' }),
    ).toBeInTheDocument();
    document.body.innerHTML = '';
    await renderPage({ from: '2026-01-01', limit: '5' });
    expect(
      screen.getByRole('heading', { name: 'No fuel logs match these filters' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Clear filters' })
        .map((a) => a.getAttribute('href')),
    ).toEqual([`/vehicles/${ID}/fuel?limit=5`, `/vehicles/${ID}/fuel?limit=5`]);
    document.body.innerHTML = '';
    listFuelLogs.mockResolvedValue(listResult(0, 45, 9));
    await renderPage({ page: '9' });
    expect(
      screen.getByRole('heading', { name: 'No fuel logs on this page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', `/vehicles/${ID}/fuel?page=3`);
  });

  it('keeps the filters in the pagination links', async () => {
    listFuelLogs.mockResolvedValue(listResult(2, 45, 2, 2));
    await renderPage({ page: '2', limit: '2', from: '2026-01-01' });
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/fuel?from=2026-01-01&limit=2&page=3`,
    );
  });

  it('shows the flash notice and the ignored-filter warning', async () => {
    await renderPage({ notice: 'fuel-log-deleted', to: 'garbage' });
    expect(screen.getAllByRole('status').map((n) => n.textContent)).toContain(
      'Fuel log deleted.',
    );
    expect(
      screen.getByText(
        'Some filters in the address were not valid and were ignored.',
      ),
    ).toBeInTheDocument();
  });
});
