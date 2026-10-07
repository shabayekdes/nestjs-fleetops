// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const getFleetDashboard = vi.hoisted(() => vi.fn());
const getMyDashboard = vi.hoisted(() => vi.fn());
const getFleetCostSummary = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('./_lib/dashboard-api', () => ({ getFleetDashboard, getMyDashboard }));
vi.mock('@/lib/costs/cost-summary-api', () => ({ getFleetCostSummary }));
// The sections are async Server Components, which jsdom cannot render; they
// have their own tests. Stubs show which ones the page chose for the role.
vi.mock('./_components/fleet-overview', () => ({
  FleetOverview: () => <div data-testid="fleet-overview" />,
}));
vi.mock('./_components/fleet-costs', () => ({
  FleetCosts: () => <div data-testid="fleet-costs" />,
}));
vi.mock('./_components/driver-overview', () => ({
  DriverOverview: () => <div data-testid="driver-overview" />,
}));

import DashboardPage from './page';

beforeEach(() => {
  for (const mock of [getFleetDashboard, getMyDashboard, getFleetCostSummary]) {
    mock.mockReset();
  }
});

describe('DashboardPage', () => {
  it('shows the heading and the welcome text', async () => {
    getCurrentUser.mockResolvedValue({ firstName: 'Alex', role: 'ADMIN' });
    render(await DashboardPage());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Welcome, Alex.')).toBeInTheDocument();
  });

  it.each(['ADMIN', 'MANAGER'])(
    'shows the fleet view to a %s',
    async (role) => {
      getCurrentUser.mockResolvedValue({ firstName: 'Alex', role });
      render(await DashboardPage());
      expect(screen.getByTestId('fleet-overview')).toBeInTheDocument();
      expect(screen.getByTestId('fleet-costs')).toBeInTheDocument();
      expect(screen.queryByTestId('driver-overview')).toBeNull();
    },
  );

  it('shows only the driver view to a DRIVER and calls no fleet endpoint', async () => {
    getCurrentUser.mockResolvedValue({ firstName: 'Sam', role: 'DRIVER' });
    render(await DashboardPage());
    expect(screen.getByTestId('driver-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('fleet-overview')).toBeNull();
    expect(screen.queryByTestId('fleet-costs')).toBeNull();
    expect(getFleetDashboard).not.toHaveBeenCalled();
    expect(getFleetCostSummary).not.toHaveBeenCalled();
  });
});
