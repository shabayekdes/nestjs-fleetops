// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getDriver = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const loadAssignmentSection = vi.hoisted(() => vi.fn());
vi.mock('../_lib/drivers-api', () => ({ getDriver }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/lib/assignments/assignments-api', () => ({
  loadAssignmentSection,
}));
vi.mock('@/lib/assignments/actions', () => ({
  assignVehicleToDriver: vi.fn(),
  endAssignment: vi.fn(),
}));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('./delete-driver-button', () => ({
  DeleteDriverButton: () => <button>Delete</button>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import DriverDetailPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const driver = {
  id: ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  licenseNumber: 'AB-123',
  licenseExpiresOn: '2099-05-20',
  licenseStatus: 'VALID',
  userId: 'user-1' as string | null,
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

async function renderPage(
  id: string = ID,
  search: Record<string, string> = {},
) {
  render(
    await DriverDetailPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(search),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  getDriver.mockReset();
  getDriver.mockResolvedValue(driver);
  loadAssignmentSection.mockReset();
  loadAssignmentSection.mockResolvedValue({
    kind: 'ok',
    current: null,
    past: { data: [], meta: { page: 1, limit: 10, total: 0 } },
    vehicleOptions: {
      data: [
        {
          id: 'v1',
          make: { id: 'make-1', name: 'Ford' },
          model: { id: 'model-1', name: 'Transit' },
          vin: 'VIN1',
          licensePlate: 'AB-1',
        },
      ],
      truncated: false,
    },
  });
});

describe('DriverDetailPage', () => {
  it('renders the fields, the formatted expiry and the assignment section', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AB-123')).toBeInTheDocument();
    expect(screen.getByText('May 20, 2099')).toBeInTheDocument();
    expect(screen.getByText(/Jun 15, 2026/)).toHaveTextContent('UTC');
    expect(loadAssignmentSection).toHaveBeenCalledWith({ driverId: ID }, 1, {
      withOptions: true,
    });
    expect(
      screen.getByRole('option', { name: 'Ford Transit (AB-1)' }),
    ).toBeInTheDocument();
  });

  it('shows View user to an admin', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'View user' })).toHaveAttribute(
      'href',
      '/users/user-1',
    );
  });

  it('shows "Linked" without a link to a manager', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'MANAGER' });
    await renderPage();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View user' })).toBeNull();
  });

  it('shows "Not linked" without an account', async () => {
    getDriver.mockResolvedValue({ ...driver, userId: null });
    await renderPage();
    expect(screen.getByText('Not linked')).toBeInTheDocument();
  });

  it('shows the Expired badge and passes the warning to the form', async () => {
    getDriver.mockResolvedValue({
      ...driver,
      licenseExpiresOn: '2020-01-02',
      licenseStatus: 'EXPIRED',
    });
    await renderPage();
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "This driver's license expired on Jan 2, 2020. New assignments will be refused until the expiry date is updated.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeEnabled();
  });

  it('uses the API status for the badge and warning, not the date', async () => {
    getDriver.mockResolvedValue({
      ...driver,
      licenseExpiresOn: '2020-01-02',
      licenseStatus: 'VALID',
    });
    await renderPage();
    expect(screen.queryByText('Expired')).toBeNull();
    expect(screen.queryByText(/New assignments will be refused/)).toBeNull();
  });

  it('shows no warning for a valid license', async () => {
    await renderPage();
    expect(screen.queryByText(/New assignments will be refused/)).toBeNull();
  });

  it('shows NotAllowed to a driver with no fetch', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(getDriver).not.toHaveBeenCalled();
    expect(loadAssignmentSection).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(renderPage('..%2Fusers')).rejects.toThrow('NOT_FOUND');
    expect(getDriver).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getDriver.mockRejectedValue(apiError(status));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    getDriver.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getDriver.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('reads the history page leniently', async () => {
    await renderPage(ID, { assignmentsPage: 'abc' });
    expect(loadAssignmentSection).toHaveBeenCalledWith(
      { driverId: ID },
      1,
      expect.anything(),
    );
    loadAssignmentSection.mockClear();
    await renderPage(ID, { assignmentsPage: '3' });
    expect(loadAssignmentSection).toHaveBeenCalledWith(
      { driverId: ID },
      3,
      expect.anything(),
    );
  });
});
