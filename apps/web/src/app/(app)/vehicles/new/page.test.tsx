// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const listVehicleMakes = vi.hoisted(() => vi.fn());
const listVehicleTypes = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
vi.mock('@/lib/master-data/master-data-api', () => ({
  listVehicleMakes,
  listVehicleTypes,
}));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../actions', () => ({ createVehicle: vi.fn() }));
vi.mock('../_components/vehicle-form', () => ({
  VehicleForm: (props: unknown) => {
    formProps(props);
    return <form aria-label="vehicle form" />;
  },
}));

import NewVehiclePage from './page';

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  listVehicleMakes.mockResolvedValue({ data: [{ id: 'm1', name: 'Toyota' }] });
  listVehicleTypes.mockResolvedValue({ data: [{ id: 't1', name: 'Car' }] });
  formProps.mockReset();
});

describe('NewVehiclePage', () => {
  it('shows the form to a manager', async () => {
    render(await NewVehiclePage());
    expect(
      screen.getByRole('form', { name: 'vehicle form' }),
    ).toBeInTheDocument();
  });

  it('passes the active makes and vehicle types to the form', async () => {
    render(await NewVehiclePage());
    expect(formProps).toHaveBeenCalledWith(
      expect.objectContaining({
        makes: [{ id: 'm1', name: 'Toyota' }],
        vehicleTypes: [{ id: 't1', name: 'Car' }],
        initialValues: {},
      }),
    );
    expect(listVehicleMakes).toHaveBeenCalledWith();
  });

  it('shows NotAllowed to a driver', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    render(await NewVehiclePage());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(screen.queryByRole('form')).toBeNull();
    expect(listVehicleMakes).not.toHaveBeenCalled();
  });
});
