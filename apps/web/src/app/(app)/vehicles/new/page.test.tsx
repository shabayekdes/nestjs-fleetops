// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../actions', () => ({ createVehicle: vi.fn() }));
vi.mock('../_components/vehicle-form', () => ({
  VehicleForm: () => <form aria-label="vehicle form" />,
}));

import NewVehiclePage from './page';

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
});

describe('NewVehiclePage', () => {
  it('shows the form to a manager', async () => {
    render(await NewVehiclePage());
    expect(
      screen.getByRole('form', { name: 'vehicle form' }),
    ).toBeInTheDocument();
  });

  it('shows NotAllowed to a driver', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    render(await NewVehiclePage());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(screen.queryByRole('form')).toBeNull();
  });
});
