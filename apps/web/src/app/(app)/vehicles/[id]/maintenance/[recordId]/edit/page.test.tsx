// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getMaintenanceRecord = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
const updateMaintenanceRecord = vi.hoisted(() => ({
  bind: vi.fn(() => 'bound-action'),
}));
vi.mock('../../_lib/maintenance-api', () => ({ getMaintenanceRecord }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../../actions', () => ({ updateMaintenanceRecord }));
vi.mock('../../_components/maintenance-form', () => ({
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

import EditMaintenanceRecordPage from './page';

const VID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const RID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const record = {
  id: RID,
  vehicleId: VID,
  type: 'BRAKES',
  description: null,
  vendor: 'V',
  performedOn: '2026-01-15',
  odometerKm: 500,
  cost: '89.90',
  nextServiceDueOn: null,
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
  return EditMaintenanceRecordPage({
    params: Promise.resolve({ id, recordId }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  getMaintenanceRecord.mockReset();
  getMaintenanceRecord.mockResolvedValue(record);
  formProps.mockReset();
  updateMaintenanceRecord.bind.mockClear();
});

describe('EditMaintenanceRecordPage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    render(await page());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(getMaintenanceRecord).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed vehicle or record id', async () => {
    await expect(page('nope')).rejects.toThrow('NOT_FOUND');
    await expect(page(VID, 'nope')).rejects.toThrow('NOT_FOUND');
    expect(getMaintenanceRecord).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getMaintenanceRecord.mockRejectedValue(apiError(status));
    await expect(page()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows a 500', async () => {
    getMaintenanceRecord.mockRejectedValueOnce(apiError(403));
    render(await page());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    getMaintenanceRecord.mockRejectedValueOnce(apiError(500));
    await expect(page()).rejects.toBeInstanceOf(ApiError);
  });

  it('binds the original, fills the form and cancels to the list', async () => {
    render(await page());
    expect(updateMaintenanceRecord.bind).toHaveBeenCalledWith(null, VID, RID, {
      type: 'BRAKES',
      performedOn: '2026-01-15',
      cost: '89.90',
      odometerKm: 500,
      vendor: 'V',
      description: null,
      nextServiceDueOn: null,
    });
    const props = formProps.mock.calls[0]?.[0] as {
      initialValues: Record<string, string>;
      cancelHref: string;
    };
    expect(props.initialValues).toEqual({
      type: 'BRAKES',
      performedOn: '2026-01-15',
      cost: '89.90',
      odometerKm: '500',
      vendor: 'V',
      description: '',
      nextServiceDueOn: '',
    });
    expect(props.cancelHref).toBe(`/vehicles/${VID}/maintenance`);
  });
});
