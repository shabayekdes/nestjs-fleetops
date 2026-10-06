// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getVehicle = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('../_lib/vehicles-api', () => ({ getVehicle }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('./delete-vehicle-button', () => ({
  DeleteVehicleButton: () => <button>Delete</button>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import VehicleDetailPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const vehicle = {
  id: ID,
  make: 'Ford',
  model: 'Transit',
  year: 2022,
  vin: '1FTBW3XM5PKA00001',
  licensePlate: 'AB-123' as string | null,
  nextServiceDueOn: null,
  serviceStatus: 'UNKNOWN',
  createdAt: '2026-06-15T10:05:00.000Z',
  updatedAt: '2026-06-16T11:30:00.000Z',
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

async function renderPage(id: string = ID, notice?: string) {
  render(
    await VehicleDetailPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(notice ? { notice } : {}),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
  getVehicle.mockResolvedValue(vehicle);
});

describe('VehicleDetailPage', () => {
  it('renders the fields', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Ford Transit' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1FTBW3XM5PKA00001')).toBeInTheDocument();
    expect(screen.getByText('AB-123')).toBeInTheDocument();
    expect(screen.getByText(/Jun 15, 2026/)).toHaveTextContent('UTC');
    expect(screen.getByText(/Jun 16, 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to vehicles' }),
    ).toHaveAttribute('href', '/vehicles');
  });

  it('shows "Not registered" without a plate', async () => {
    getVehicle.mockResolvedValue({ ...vehicle, licensePlate: null });
    await renderPage();
    expect(screen.getByText('Not registered')).toBeInTheDocument();
  });

  it('shows the flash notice', async () => {
    await renderPage(ID, 'vehicle-created');
    expect(screen.getByRole('status')).toHaveTextContent('Vehicle created.');
  });

  it('calls notFound for an invalid id without calling the API', async () => {
    await expect(renderPage('..%2Fusers')).rejects.toThrow('NOT_FOUND');
    expect(getVehicle).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getVehicle.mockRejectedValue(apiError(status));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    getVehicle.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getVehicle.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('shows Edit and Delete to a manager', async () => {
    getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
    await renderPage();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/edit`,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides Edit and Delete from a driver', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
