// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../actions', () => ({ createUser: vi.fn() }));
vi.mock('../_components/user-form', () => ({
  UserForm: ({ mode }: { mode: string }) => (
    <form aria-label={`user form ${mode}`} />
  ),
}));

import NewUserPage from './page';

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
});

describe('NewUserPage', () => {
  it('shows the create form to an admin', async () => {
    render(await NewUserPage());
    expect(
      screen.getByRole('heading', { name: 'Add user' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'user form create' }),
    ).toBeInTheDocument();
  });

  it.each(['MANAGER', 'DRIVER'])('shows NotAllowed to a %s', async (role) => {
    getCurrentUser.mockResolvedValue({ id: 'me', role });
    render(await NewUserPage());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(screen.queryByRole('form')).toBeNull();
  });
});
