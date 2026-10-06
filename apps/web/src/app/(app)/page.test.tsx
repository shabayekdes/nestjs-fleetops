// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));

import DashboardPage from './page';

describe('DashboardPage', () => {
  it('shows the heading, welcome text and empty state', async () => {
    getCurrentUser.mockResolvedValue({ firstName: 'Alex' });
    render(await DashboardPage());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Welcome, Alex.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Your fleet overview will appear here',
      }),
    ).toBeInTheDocument();
  });
});
