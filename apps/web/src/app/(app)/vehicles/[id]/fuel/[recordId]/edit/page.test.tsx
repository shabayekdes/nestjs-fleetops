// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getFuelLog = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
const updateFuelLog = vi.hoisted(() => ({
  bind: vi.fn(() => 'bound-action'),
}));
vi.mock('../../_lib/fuel-api', () => ({ getFuelLog }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../../actions', () => ({ updateFuelLog }));
vi.mock('../../_components/fuel-form', () => ({
  FuelForm: (props: unknown) => {
    formProps(props);
    return <form aria-label="fuel form" />;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import EditFuelLogPage from './page';

const VID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const RID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const log = {
  id: RID,
  vehicleId: VID,
  fueledOn: '2026-01-15',
  liters: '45.500',
  totalCost: '80.00',
  odometerKm: null,
  createdAt: '',
  updatedAt: '',
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

function page(id: string = VID, recordId: string = RID) {
  return EditFuelLogPage({
    params: Promise.resolve({ id, recordId }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  getFuelLog.mockReset();
  getFuelLog.mockResolvedValue(log);
  formProps.mockReset();
  updateFuelLog.bind.mockClear();
});

describe('EditFuelLogPage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    render(await page());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(getFuelLog).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed vehicle or log id', async () => {
    await expect(page('nope')).rejects.toThrow('NOT_FOUND');
    await expect(page(VID, 'nope')).rejects.toThrow('NOT_FOUND');
    expect(getFuelLog).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getFuelLog.mockRejectedValue(apiError(status));
    await expect(page()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows a 500', async () => {
    getFuelLog.mockRejectedValueOnce(apiError(403));
    render(await page());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    getFuelLog.mockRejectedValueOnce(apiError(500));
    await expect(page()).rejects.toBeInstanceOf(ApiError);
  });

  it('binds the original, fills the form and cancels to the list', async () => {
    render(await page());
    expect(updateFuelLog.bind).toHaveBeenCalledWith(null, VID, RID, {
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: null,
    });
    const props = formProps.mock.calls[0]?.[0] as {
      initialValues: Record<string, string>;
      cancelHref: string;
    };
    expect(props.initialValues).toEqual({
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: '',
    });
    expect(props.cancelHref).toBe(`/vehicles/${VID}/fuel`);
  });
});
