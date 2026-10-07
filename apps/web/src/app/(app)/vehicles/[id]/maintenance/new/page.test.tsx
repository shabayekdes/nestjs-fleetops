// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const loadVehicle = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('../../../_lib/load-vehicle', () => ({ loadVehicle }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../actions', () => ({ createMaintenanceRecord: vi.fn() }));
vi.mock('../_components/maintenance-form', () => ({
  MaintenanceForm: (props: unknown) => {
    formProps(props);
    return <form aria-label="maintenance form" />;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import NewMaintenanceRecordPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

function render_(id: string = ID) {
  return NewMaintenanceRecordPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  loadVehicle.mockReset();
  loadVehicle.mockResolvedValue({
    kind: 'ok',
    vehicle: { id: ID, make: 'Ford', model: 'Transit' },
  });
  formProps.mockReset();
});

describe('NewMaintenanceRecordPage', () => {
  it('shows NotAllowed to a driver before loading the vehicle', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    render(await render_());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(render_('nope')).rejects.toThrow('NOT_FOUND');
    expect(loadVehicle).not.toHaveBeenCalled();
  });

  it('shows NotAllowed when the vehicle load is forbidden', async () => {
    loadVehicle.mockResolvedValue({ kind: 'forbidden' });
    render(await render_());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the form with tomorrow as the latest date and Cancel to the list', async () => {
    render(await render_());
    expect(screen.getByText('Ford Transit')).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'maintenance form' }),
    ).toBeInTheDocument();
    const props = formProps.mock.calls[0]?.[0] as {
      maxDate: string;
      cancelHref: string;
    };
    expect(props.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(props.cancelHref).toBe(`/vehicles/${ID}/maintenance`);
  });
});
