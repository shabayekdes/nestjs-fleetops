// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const logout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/actions', () => ({ logout }));

import { UserMenu } from './user-menu';
import type { ShellUser } from './shell-user';

const user: ShellUser = {
  name: 'Alex Fleetwood',
  email: 'alex@acme.test',
  role: 'ADMIN',
  organizationName: 'Acme Logistics',
};

function open() {
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Account menu, Alex Fleetwood' }),
    { key: 'Enter' },
  );
}

describe('UserMenu', () => {
  it('shows the name on the trigger', () => {
    render(<UserMenu user={user} />);
    expect(
      screen.getByRole('button', { name: 'Account menu, Alex Fleetwood' }),
    ).toHaveTextContent('Alex Fleetwood');
  });

  it('shows email, role and organization when open', () => {
    render(<UserMenu user={user} />);
    open();
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('alex@acme.test');
    expect(menu).toHaveTextContent('Admin');
    expect(menu).toHaveTextContent('Acme Logistics');
    expect(screen.queryByText(/change password/i)).toBeNull();
  });

  it('signs out once when Sign out is selected', async () => {
    logout.mockResolvedValue(undefined);
    render(<UserMenu user={user} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
