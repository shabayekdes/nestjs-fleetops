// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getUser = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('../_lib/users-api', () => ({ getUser }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('./delete-user-button', () => ({
  DeleteUserButton: ({ isSelf }: { isSelf: boolean }) => (
    <button disabled={isSelf}>Delete</button>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import UserDetailPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const user = {
  id: ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'MANAGER',
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
    await UserDetailPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(notice ? { notice } : {}),
    }),
  );
}

beforeEach(() => {
  getUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  getUser.mockResolvedValue(user);
});

describe('UserDetailPage', () => {
  it('renders the fields and links', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText(/Jun 15, 2026/)).toHaveTextContent('UTC');
    expect(screen.getByText(/Jun 16, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/users/${ID}/edit`,
    );
    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
      'href',
      '/users',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.queryByText('This is your account.')).toBeNull();
  });

  it('shows the flash notice', async () => {
    await renderPage(ID, 'user-created');
    expect(screen.getByRole('status')).toHaveTextContent('User created.');
  });

  it('marks your own account and disables Delete', async () => {
    getCurrentUser.mockResolvedValue({ id: ID, role: 'ADMIN' });
    await renderPage();
    expect(screen.getByText('This is your account.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it.each(['MANAGER', 'DRIVER'])(
    'shows NotAllowed to a %s without fetching',
    async (role) => {
      getCurrentUser.mockResolvedValue({ id: 'me', role });
      await renderPage();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'You are not allowed to do this.',
      );
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it('calls notFound for an invalid id without calling the API', async () => {
    await expect(renderPage('..%2Fusers')).rejects.toThrow('NOT_FOUND');
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getUser.mockRejectedValue(apiError(status));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    getUser.mockRejectedValue(apiError(403));
    await renderPage();
    expect(screen.getByRole('heading', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getUser.mockRejectedValue(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });
});
