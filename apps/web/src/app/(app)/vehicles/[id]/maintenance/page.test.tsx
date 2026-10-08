// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listMaintenanceRecords = vi.hoisted(() => vi.fn());
const loadVehicle = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('./_lib/maintenance-api', () => ({ listMaintenanceRecords }));
vi.mock('../../_lib/load-vehicle', () => ({ loadVehicle }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('./actions', () => ({ deleteMaintenanceRecord: vi.fn() }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  useSearchParams: () => new URLSearchParams(),
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

import MaintenancePage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const vehicle = { id: ID, make: 'Ford', model: 'Transit' };

function record(n: number) {
  return {
    id: `rec-${n}`,
    vehicleId: ID,
    type: 'TIRES',
    description: `Work ${n}`,
    vendor: null,
    performedOn: '2026-01-15',
    odometerKm: null,
    cost: '1234.5'.padEnd(7, '0').slice(0, 7),
    nextServiceDueOn: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  };
}

function listResult(count: number, total = count, page = 1, limit = 20) {
  return {
    data: Array.from({ length: count }, (_, i) => record(i + 1)),
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
    await MaintenancePage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  loadVehicle.mockReset();
  loadVehicle.mockResolvedValue({ kind: 'ok', vehicle });
  listMaintenanceRecords.mockReset();
  listMaintenanceRecords.mockResolvedValue(listResult(2));
});

describe('MaintenancePage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Maintenance' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(listMaintenanceRecords).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(renderPage({}, '..%2Fusers')).rejects.toThrow('NOT_FOUND');
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(listMaintenanceRecords).not.toHaveBeenCalled();
  });

  it('calls notFound when the list answers 404', async () => {
    listMaintenanceRecords.mockRejectedValue(apiError(404));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed when the vehicle load is forbidden', async () => {
    loadVehicle.mockResolvedValue({ kind: 'forbidden' });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('lets a forbidden vehicle win over a failing list request', async () => {
    loadVehicle.mockResolvedValue({ kind: 'forbidden' });
    listMaintenanceRecords.mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows NotAllowed when the list answers 403 and rethrows a 500', async () => {
    listMaintenanceRecords.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    listMaintenanceRecords.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('shows the API message for a 400 with a Clear filters link', async () => {
    listMaintenanceRecords.mockRejectedValue(
      apiError(400, 'from must not be after to'),
    );
    await renderPage({ from: '2026-05-01', to: '2026-01-01', limit: '5' });
    expect(
      screen.getByRole('heading', {
        name: 'These filters could not be applied',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('from must not be after to')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/maintenance?limit=5`,
    );
  });

  it('renders the header, the section nav and formatted rows', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Maintenance' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ford Transit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add record' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/maintenance/new`,
    );
    expect(screen.getByRole('link', { name: 'Maintenance' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByText('1,234.50')).toHaveLength(2);
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });

  it('passes the parsed query to the API', async () => {
    await renderPage({
      page: '2',
      limit: '5',
      type: 'BRAKES',
      from: '2026-01-01',
      notice: 'x',
    });
    expect(listMaintenanceRecords).toHaveBeenCalledWith(ID, {
      page: 2,
      limit: 5,
      type: 'BRAKES',
      from: '2026-01-01',
    });
  });

  it('shows "No maintenance records yet" with an Add action', async () => {
    listMaintenanceRecords.mockResolvedValue(listResult(0));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No maintenance records yet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add record' })).toHaveLength(2);
  });

  it('shows the filtered empty state with a Clear filters link', async () => {
    listMaintenanceRecords.mockResolvedValue(listResult(0));
    await renderPage({ type: 'TIRES', limit: '5' });
    expect(
      screen.getByRole('heading', {
        name: 'No maintenance records match these filters',
      }),
    ).toBeInTheDocument();
    const hrefs = screen
      .getAllByRole('link', { name: 'Clear filters' })
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      `/vehicles/${ID}/maintenance?limit=5`,
      `/vehicles/${ID}/maintenance?limit=5`,
    ]);
  });

  it('shows the past-the-end state with a link to the last page', async () => {
    listMaintenanceRecords.mockResolvedValue(listResult(0, 45, 9));
    await renderPage({ page: '9', type: 'TIRES' });
    expect(
      screen.getByRole('heading', { name: 'No records on this page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', `/vehicles/${ID}/maintenance?type=TIRES&page=3`);
  });

  it('keeps the filters in the pagination links', async () => {
    listMaintenanceRecords.mockResolvedValue(listResult(2, 45, 2, 2));
    await renderPage({
      page: '2',
      limit: '2',
      type: 'TIRES',
      from: '2026-01-01',
    });
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/maintenance?type=TIRES&from=2026-01-01&limit=2&page=3`,
    );
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/maintenance?type=TIRES&from=2026-01-01&limit=2`,
    );
  });

  it('shows the flash notice and the ignored-filter warning', async () => {
    await renderPage({ notice: 'maintenance-created', from: 'garbage' });
    const statuses = screen.getAllByRole('status').map((n) => n.textContent);
    expect(statuses).toContain('Maintenance record added.');
    expect(
      screen.getByText(
        'Some filters in the address were not valid and were ignored.',
      ),
    ).toBeInTheDocument();
    expect(listMaintenanceRecords).toHaveBeenCalledWith(ID, {
      page: 1,
      limit: 20,
    });
  });
});
