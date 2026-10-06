// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getDriver = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const loadUserPicker = vi.hoisted(() => vi.fn());
vi.mock('../../_lib/drivers-api', () => ({ getDriver }));
vi.mock('../../_lib/user-options', () => ({ loadUserPicker }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../../actions', () => ({ updateDriver: { bind: () => vi.fn() } }));
vi.mock('../../_components/driver-form', () => ({
  DriverForm: ({
    userOptions,
    initialValues,
  }: {
    userOptions?: { id: string; label: string }[];
    initialValues: Record<string, string>;
  }) => (
    <form aria-label="driver form">
      <output aria-label="initial">{JSON.stringify(initialValues)}</output>
      {userOptions?.map((o) => (
        <span key={o.id}>{o.label}</span>
      ))}
    </form>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import EditDriverPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const driver = {
  id: ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  licenseNumber: 'AB-123',
  licenseExpiresOn: '2030-05-20',
  userId: 'u1' as string | null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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

async function renderPage(id: string = ID) {
  render(
    await EditDriverPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  getDriver.mockReset();
  getDriver.mockResolvedValue(driver);
  loadUserPicker.mockReset();
  loadUserPicker.mockResolvedValue({
    options: [{ id: 'u1', label: 'Current linked account' }],
    truncated: false,
  });
});

describe('EditDriverPage', () => {
  it('passes the current linked user to the picker for an admin', async () => {
    await renderPage();
    expect(loadUserPicker).toHaveBeenCalledWith('ADMIN', 'u1');
    expect(screen.getByText('Current linked account')).toBeInTheDocument();
    expect(screen.getByLabelText('initial')).toHaveTextContent('"userId":"u1"');
  });

  it('gives a manager no account options', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'MANAGER' });
    loadUserPicker.mockResolvedValue({ truncated: false });
    await renderPage();
    expect(screen.queryByText('Current linked account')).toBeNull();
  });

  it('shows NotAllowed to a driver with no fetch', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(getDriver).not.toHaveBeenCalled();
    expect(loadUserPicker).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(renderPage('..%2Fusers')).rejects.toThrow('NOT_FOUND');
    expect(getDriver).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getDriver.mockRejectedValue(apiError(status));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403', async () => {
    getDriver.mockRejectedValue(apiError(403));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Edit driver' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });
});
