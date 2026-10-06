// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const loadUserPicker = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('../_lib/user-options', () => ({ loadUserPicker }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('../actions', () => ({ createDriver: vi.fn() }));
vi.mock('../_components/driver-form', () => ({
  DriverForm: ({ userOptions }: { userOptions?: unknown[] }) => (
    <form aria-label="driver form">
      {userOptions ? <select aria-label="Login account" /> : null}
    </form>
  ),
}));

import NewDriverPage from './page';

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'me', role: 'ADMIN' });
  loadUserPicker.mockReset();
  loadUserPicker.mockResolvedValue({ options: [], truncated: false });
});

describe('NewDriverPage', () => {
  it('gives an admin the account field', async () => {
    render(await NewDriverPage());
    expect(screen.getByLabelText('Login account')).toBeInTheDocument();
    expect(loadUserPicker).toHaveBeenCalledWith('ADMIN');
  });

  it('gives a manager the form without the account field', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'MANAGER' });
    loadUserPicker.mockResolvedValue({ truncated: false });
    render(await NewDriverPage());
    expect(
      screen.getByRole('form', { name: 'driver form' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Login account')).toBeNull();
  });

  it('shows NotAllowed to a driver without fetching anything', async () => {
    getCurrentUser.mockResolvedValue({ id: 'me', role: 'DRIVER' });
    render(await NewDriverPage());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(loadUserPicker).not.toHaveBeenCalled();
    expect(screen.queryByRole('form')).toBeNull();
  });
});
