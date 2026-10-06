// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getUser = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));
vi.mock('../../_lib/users-api', () => ({ getUser }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../../actions', () => ({ updateUser }));
vi.mock('../../_components/user-form', () => ({
  UserForm: (props: Record<string, unknown>) => {
    formProps.current = props;
    return <form aria-label="user form" />;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import EditUserPage from './page';

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

async function renderPage(id: string = ID) {
  render(
    await EditUserPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  getUser.mockReset();
  updateUser.mockReset();
  updateUser.mockReturnValue(vi.fn());
  formProps.current = undefined;
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  getUser.mockResolvedValue(user);
});

describe('EditUserPage', () => {
  it('renders the edit form with the current values and the password hint', async () => {
    await renderPage();
    expect(screen.getByRole('form', { name: 'user form' })).toBeInTheDocument();
    expect(formProps.current).toMatchObject({
      mode: 'edit',
      isSelf: false,
      initialValues: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'MANAGER',
      },
      cancelHref: `/users/${ID}`,
    });
    expect(formProps.current?.action).toBeTypeOf('function');
    expect(
      screen.getByText(/Passwords are changed by each user/),
    ).toBeInTheDocument();
  });

  it('passes isSelf for your own record', async () => {
    getCurrentUser.mockResolvedValue({ id: ID, role: 'ADMIN' });
    await renderPage();
    expect(formProps.current?.isSelf).toBe(true);
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
    await expect(renderPage('nope')).rejects.toThrow('NOT_FOUND');
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([404, 400])('calls notFound on a %i', async (status) => {
    getUser.mockRejectedValue(apiError(status));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    getUser.mockRejectedValue(apiError(403));
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Edit user' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getUser.mockRejectedValue(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });
});
