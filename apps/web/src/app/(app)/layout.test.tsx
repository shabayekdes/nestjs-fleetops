// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const notice = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/lib/auth/session', () => ({
  SESSION_EXPIRY_SKEW_MS: 30_000,
  getSession,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/auth/actions', () => ({ logout: vi.fn() }));
vi.mock('@/components/session-deadline', () => ({
  SessionDeadlineProvider: (props: {
    remainingMs: number;
    children: ReactNode;
  }) => {
    notice(props.remainingMs);
    return <>{props.children}</>;
  },
}));
vi.mock('./session-expiry-notice', () => ({ SessionExpiryNotice: () => null }));

import AppLayout from './layout';

const user = {
  id: 'u1',
  organizationId: 'o1',
  organization: { id: 'o1', name: 'Acme Logistics', slug: 'acme' },
  firstName: 'Alex',
  lastName: 'Fleetwood',
  email: 'alex@acme.test',
  role: 'ADMIN',
};

async function renderLayout(expiresAt: number | undefined) {
  getCurrentUser.mockResolvedValue(user);
  getSession.mockResolvedValue(
    expiresAt === undefined ? null : { accessToken: 't', expiresAt },
  );
  render(await AppLayout({ children: <p>page body</p> }));
}

describe('AppLayout', () => {
  it('renders the shell around the children', async () => {
    await renderLayout(Date.now() + 600_000);
    expect(screen.getByRole('banner')).toHaveTextContent('Acme Logistics');
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveTextContent('page body');
    expect(
      screen.getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
  });

  it('clamps remainingMs to 0 for a past expiry', async () => {
    await renderLayout(Date.now() - 60_000);
    expect(notice).toHaveBeenLastCalledWith(0);
  });
});
