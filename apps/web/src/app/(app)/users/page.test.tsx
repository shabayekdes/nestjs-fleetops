// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listUsers = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('./_lib/users-api', () => ({ listUsers }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('next/form', () => ({
  default: ({
    action,
    children,
    ...rest
  }: {
    action: string;
    children: ReactNode;
  }) => (
    <form action={action} {...rest}>
      {children}
    </form>
  ),
}));

import UsersPage from './page';

function user(n: number) {
  return {
    id: `id-${n}`,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    email: `u${n}@example.test`,
    role: n % 2 ? 'DRIVER' : 'MANAGER',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'req-1',
    path: '/p',
    body: undefined,
  });
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    await UsersPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function listResult(count: number, total = count, page = 1, limit = 20) {
  return {
    data: Array.from({ length: count }, (_, i) => user(i + 1)),
    meta: { page, limit, total },
  };
}

beforeEach(() => {
  listUsers.mockReset();
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  listUsers.mockResolvedValue(listResult(2));
});

describe('UsersPage', () => {
  it('shows NotAllowed to a non-admin and never lists users', async () => {
    for (const role of ['MANAGER', 'DRIVER']) {
      document.body.innerHTML = '';
      getCurrentUser.mockResolvedValue({ id: 'me', role });
      await renderPage();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'You are not allowed to do this.',
      );
    }
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('renders the rows with links and marks your own row', async () => {
    getCurrentUser.mockResolvedValue({ id: 'id-1', role: 'ADMIN' });
    await renderPage();
    expect(screen.getByRole('link', { name: 'First1 Last1' })).toHaveAttribute(
      'href',
      '/users/id-1',
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('u2@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('(you)')).toHaveLength(1);
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add user' })).toHaveAttribute(
      'href',
      '/users/new',
    );
  });

  it('passes the role filter and paging to the API and ignores notice', async () => {
    await renderPage({ role: 'MANAGER', page: '2', limit: '5', notice: 'x' });
    expect(listUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      role: 'MANAGER',
    });
  });

  it('shows "No users found" without a filter', async () => {
    listUsers.mockResolvedValue(listResult(0));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No users found' }),
    ).toBeInTheDocument();
  });

  it('shows "No users match this role" with a clear link', async () => {
    listUsers.mockResolvedValue(listResult(0));
    await renderPage({ role: 'DRIVER', limit: '5' });
    expect(
      screen.getByRole('heading', { name: 'No users match this role' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Clear filters' })[0],
    ).toHaveAttribute('href', '/users?limit=5');
  });

  it('shows "No users on this page" with a link to the last page', async () => {
    listUsers.mockResolvedValue(listResult(0, 45, 9, 20));
    await renderPage({ page: '9' });
    expect(
      screen.getByRole('heading', { name: 'No users on this page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', '/users?page=3');
  });

  it('shows the flash message', async () => {
    await renderPage({ notice: 'user-deleted' });
    expect(screen.getByRole('status')).toHaveTextContent('User deleted.');
  });

  it('warns about ignored params and still renders', async () => {
    await renderPage({ role: 'admin' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some filters in the address were not valid and were ignored.',
    );
    expect(listUsers).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows NotAllowed on a 403 from the API', async () => {
    listUsers.mockRejectedValue(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows the filter error on a 400', async () => {
    listUsers.mockRejectedValue(apiError(400));
    await renderPage({ role: 'ADMIN' });
    expect(
      screen.getByRole('heading', {
        name: 'These filters could not be applied',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/users',
    );
  });

  it('rethrows other errors', async () => {
    listUsers.mockRejectedValue(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('selects the filtered role in the form', async () => {
    await renderPage({ role: 'MANAGER', limit: '5' });
    expect(screen.getByLabelText('Role')).toHaveValue('MANAGER');
    expect(
      document.querySelector('input[type="hidden"][name="limit"]'),
    ).toHaveValue('5');
  });
});
