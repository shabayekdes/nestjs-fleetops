// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/auth/actions', () => ({ logout: vi.fn() }));

import { AppHeader } from './app-header';

describe('AppHeader', () => {
  it('shows the organization and the account menu in the banner', () => {
    render(
      <AppHeader
        user={{
          name: 'Alex Fleetwood',
          email: 'a@b.test',
          role: 'ADMIN',
          organizationName: 'Acme Logistics',
        }}
      />,
    );
    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent('Acme Logistics');
    expect(
      screen.getByRole('button', { name: 'Account menu, Alex Fleetwood' }),
    ).toBeInTheDocument();
  });
});
