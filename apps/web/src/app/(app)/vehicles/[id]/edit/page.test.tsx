// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getVehicle = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
const listVehicleMakes = vi.hoisted(() => vi.fn());
const listVehicleModels = vi.hoisted(() => vi.fn());
const listVehicleTypes = vi.hoisted(() => vi.fn());
vi.mock('@/lib/master-data/master-data-api', () => ({
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
}));
vi.mock('../../_lib/vehicles-api', () => ({ getVehicle }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../../actions', () => ({ updateVehicle: vi.fn() }));
vi.mock('../../_components/vehicle-form', () => ({
  VehicleForm: (props: unknown) => {
    formProps(props);
    return <form aria-label="vehicle form" />;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import EditVehiclePage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const vehicle = {
  id: ID,
  make: { id: 'make-1', name: 'Ford' },
  model: { id: 'model-1', name: 'Transit' },
  vehicleType: { id: 'type-1', name: 'Van' },
  year: 2022,
  vin: '1FTBW3XM5PKA00001',
  licensePlate: null,
};

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

async function renderPage(id = ID) {
  render(
    await EditVehiclePage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  getVehicle.mockResolvedValue(vehicle);
  listVehicleMakes.mockResolvedValue({
    data: [{ id: 'make-1', name: 'Ford' }],
  });
  listVehicleModels.mockResolvedValue({
    data: [{ id: 'model-1', name: 'Transit' }],
  });
  listVehicleTypes.mockResolvedValue({ data: [{ id: 'type-1', name: 'Van' }] });
  formProps.mockReset();
});

describe('EditVehiclePage', () => {
  it('passes the current values to the form', async () => {
    await renderPage();
    expect(formProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: {
          makeId: 'make-1',
          modelId: 'model-1',
          vehicleTypeId: 'type-1',
          year: '2022',
          vin: '1FTBW3XM5PKA00001',
          licensePlate: '',
        },
        cancelHref: `/vehicles/${ID}`,
        makes: [{ id: 'make-1', name: 'Ford' }],
        initialModels: [{ id: 'model-1', name: 'Transit' }],
        current: {
          make: { id: 'make-1', name: 'Ford' },
          model: { id: 'model-1', name: 'Transit' },
          vehicleType: { id: 'type-1', name: 'Van' },
        },
      }),
    );
    expect(listVehicleModels).toHaveBeenCalledWith('make-1');
  });

  it('skips the models call and passes none when the vehicle make is retired', async () => {
    listVehicleMakes.mockResolvedValue({ data: [] });
    await renderPage();
    expect(listVehicleModels).not.toHaveBeenCalled();
    expect(formProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialModels: [] }),
    );
  });

  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(getVehicle).not.toHaveBeenCalled();
  });

  it('calls notFound for an invalid id without calling the API', async () => {
    await expect(renderPage('nope')).rejects.toThrow('NOT_FOUND');
    expect(getVehicle).not.toHaveBeenCalled();
  });

  it('calls notFound on a 404', async () => {
    getVehicle.mockRejectedValue(apiError(404));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });
});
