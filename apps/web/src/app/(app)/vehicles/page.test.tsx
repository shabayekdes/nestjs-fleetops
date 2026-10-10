// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listVehicles = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const listVehicleMakes = vi.hoisted(() => vi.fn());
const listVehicleModels = vi.hoisted(() => vi.fn());
const listVehicleTypes = vi.hoisted(() => vi.fn());
vi.mock('@/lib/master-data/master-data-api', () => ({
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
}));
vi.mock('./actions', () => ({
  loadVehicleModelOptions: vi.fn(async () => ({ options: [] })),
}));
vi.mock('./_lib/vehicles-api', () => ({ listVehicles }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
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

import VehiclesPage from './page';

const MAKE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const MODEL_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const TYPE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';

function vehicle(n: number) {
  return {
    id: `id-${n}`,
    make: { id: `make-${n}`, name: `Make${n}` },
    model: { id: `model-${n}`, name: `Model${n}` },
    vehicleType: { id: 'type-1', name: 'Van' },
    year: 2020,
    vin: `VIN${n}`,
    licensePlate: n % 2 ? `PLATE${n}` : null,
    nextServiceDueOn: null,
    serviceStatus: 'UNKNOWN',
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
    requestId: 'req-1',
    path: '/p',
    body: undefined,
  });
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    await VehiclesPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function listResult(count: number, total = count, page = 1, limit = 20) {
  return {
    data: Array.from({ length: count }, (_, i) => vehicle(i + 1)),
    meta: { page, limit, total },
  };
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  listVehicles.mockResolvedValue(listResult(2));
  listVehicleMakes.mockReset();
  listVehicleModels.mockReset();
  listVehicleTypes.mockReset();
  listVehicleMakes.mockResolvedValue({
    data: [
      { id: MAKE_ID, name: 'Toyota' },
      { id: 'retired-make', name: 'Saab' },
    ],
  });
  listVehicleModels.mockResolvedValue({
    data: [{ id: MODEL_ID, name: 'Corolla' }],
  });
  listVehicleTypes.mockResolvedValue({ data: [{ id: TYPE_ID, name: 'Car' }] });
});

describe('VehiclesPage', () => {
  it('renders the rows with links and a dash for a missing plate', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Make1' })).toHaveAttribute(
      'href',
      '/vehicles/id-1',
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('PLATE1')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });

  it('shows the service badge and the due date in the Service column', async () => {
    listVehicles.mockResolvedValue({
      data: [
        {
          ...vehicle(1),
          serviceStatus: 'OVERDUE',
          nextServiceDueOn: '2026-01-15',
        },
        vehicle(2),
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });
    await renderPage();
    expect(
      screen.getByRole('columnheader', { name: 'Service' }),
    ).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Overdue')).toBeInTheDocument();
    expect(table.getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(table.getByText('No service date')).toBeInTheDocument();
  });

  it('offers the Service filter and passes it to the API', async () => {
    await renderPage({ serviceStatus: 'DUE_SOON' });
    const select = screen.getByLabelText('Service');
    expect(select).toHaveValue('DUE_SOON');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Any', 'Overdue', 'Due soon', 'OK', 'No service date']);
    expect(listVehicles).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      serviceStatus: 'DUE_SOON',
    });
  });

  it('passes the parsed query to the API', async () => {
    await renderPage({
      page: '2',
      limit: '5',
      makeId: ` ${MAKE_ID} `,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
      year: '2021',
      notice: 'x',
    });
    expect(listVehicles).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      makeId: MAKE_ID,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
      year: 2021,
    });
  });

  it('offers catalog filters with retired entries and the URL models', async () => {
    await renderPage({ makeId: MAKE_ID, modelId: MODEL_ID });
    expect(listVehicleMakes).toHaveBeenCalledWith({ includeInactive: true });
    expect(listVehicleTypes).toHaveBeenCalledWith({ includeInactive: true });
    expect(listVehicleModels).toHaveBeenCalledWith(MAKE_ID, {
      includeInactive: true,
    });
    expect(screen.getByLabelText('Make')).toHaveValue(MAKE_ID);
    expect(screen.getByLabelText('Model')).toHaveValue(MODEL_ID);
    expect(screen.getByLabelText('Model')).toBeEnabled();
    expect(
      within(screen.getByLabelText('Make'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Any', 'Toyota', 'Saab']);
    expect(screen.getByLabelText('Vehicle type')).toBeInTheDocument();
  });

  it('does not load models without a make and disables the Model filter', async () => {
    await renderPage();
    expect(listVehicleModels).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Model')).toBeDisabled();
  });

  it('lets the filter load the models when the make is unknown', async () => {
    listVehicleModels.mockRejectedValue(apiError(404));
    await renderPage({ makeId: MAKE_ID });
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
  });

  it('shows Add vehicle to ADMIN and MANAGER but not DRIVER', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Add vehicle' })).toHaveAttribute(
      'href',
      '/vehicles/new',
    );
    document.body.innerHTML = '';
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.queryByRole('link', { name: 'Add vehicle' })).toBeNull();
  });

  it('shows "No vehicles yet" with an Add action for managers', async () => {
    listVehicles.mockResolvedValue(listResult(0));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No vehicles yet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add vehicle' })).toHaveLength(
      2,
    );
  });

  it('shows "No vehicles yet" without an action for drivers', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    listVehicles.mockResolvedValue(listResult(0));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No vehicles yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add vehicle' })).toBeNull();
  });

  it('shows the filtered empty state with a Clear filters link', async () => {
    listVehicles.mockResolvedValue(listResult(0));
    await renderPage({ makeId: MAKE_ID, limit: '5' });
    expect(
      screen.getByRole('heading', { name: 'No vehicles match these filters' }),
    ).toBeInTheDocument();
    const clear = screen
      .getAllByRole('link', { name: 'Clear filters' })
      .map((a) => a.getAttribute('href'));
    expect(clear).toEqual(['/vehicles?limit=5', '/vehicles?limit=5']);
  });

  it('shows the out-of-range page state with a link to the last page', async () => {
    listVehicles.mockResolvedValue(listResult(0, 45, 9));
    await renderPage({ page: '9', makeId: MAKE_ID });
    expect(
      screen.getByRole('heading', { name: 'No vehicles on this page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', `/vehicles?makeId=${MAKE_ID}&page=3`);
  });

  it('shows a known flash notice and nothing for an unknown key', async () => {
    await renderPage({ notice: 'vehicle-deleted' });
    expect(screen.getByRole('status')).toHaveTextContent('Vehicle deleted.');
    document.body.innerHTML = '';
    await renderPage({ notice: 'hacked' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('warns about ignored params and still renders', async () => {
    await renderPage({ page: 'abc', year: '1800' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some filters in the address were not valid and were ignored.',
    );
    expect(screen.getByRole('link', { name: 'Make1' })).toBeInTheDocument();
  });

  it('shows NotAllowed on a 403', async () => {
    listVehicles.mockRejectedValue(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows the filter error on a 400', async () => {
    listVehicles.mockRejectedValue(apiError(400));
    await renderPage({ makeId: MAKE_ID });
    expect(
      screen.getByRole('heading', {
        name: 'These filters could not be applied',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/vehicles',
    );
  });

  it('rethrows other errors', async () => {
    listVehicles.mockRejectedValue(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });
});
