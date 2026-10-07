// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import type { CostSummary, CostSummaryMonth } from '@/lib/api/types';

const getFleetCostSummary = vi.hoisted(() => vi.fn());
const getFleetDashboard = vi.hoisted(() => vi.fn());
vi.mock('../_lib/dashboard-api', () => ({ getFleetDashboard }));
vi.mock('@/lib/costs/cost-summary-api', () => ({ getFleetCostSummary }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));

import { FleetCosts } from './fleet-costs';
import { FleetOverview } from './fleet-overview';

function month(
  m: string,
  maintenanceCost: string,
  fuelCost: string,
  totalCost: string,
): CostSummaryMonth {
  return {
    month: m,
    maintenanceCost,
    fuelCost,
    fuelLiters: '1.000',
    totalCost,
  };
}

const summary: CostSummary = {
  from: '2026-08',
  to: '2026-10',
  months: [
    month('2026-08', '1.00', '1.00', '2.00'),
    month('2026-09', '1000.50', '200.00', '1200.50'),
    month('2026-10', '30.00', '12.25', '42.25'),
  ],
  totals: {
    maintenanceCost: '1031.50',
    fuelCost: '213.25',
    fuelLiters: '3.000',
    totalCost: '1244.75',
  },
};

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'req-9',
    path: '/p',
    body: undefined,
  });
}

beforeEach(() => {
  getFleetCostSummary.mockReset();
  getFleetCostSummary.mockResolvedValue(summary);
});

describe('FleetCosts', () => {
  it('requests the default range (no params)', async () => {
    render(await FleetCosts());
    expect(getFleetCostSummary).toHaveBeenCalledWith({});
  });

  it('shows the last two months as this month and last month', async () => {
    render(await FleetCosts());
    const card = (name: RegExp) =>
      screen.getByRole('heading', { name }).closest('div') as HTMLElement;
    const thisMonth = within(card(/This month/));
    expect(thisMonth.getByText('(Oct 2026)')).toBeInTheDocument();
    expect(thisMonth.getByText('42.25')).toBeInTheDocument();
    expect(
      thisMonth.getByText('Maintenance 30.00 · Fuel 12.25'),
    ).toBeInTheDocument();
    const lastMonth = within(card(/Last month/));
    expect(lastMonth.getByText('(Sep 2026)')).toBeInTheDocument();
    expect(lastMonth.getByText('1,200.50')).toBeInTheDocument();
    expect(
      lastMonth.getByText('Maintenance 1,000.50 · Fuel 200.00'),
    ).toBeInTheDocument();
    expect(screen.queryByText('%')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('shows the chart, a collapsed data table and a link to the report', async () => {
    render(await FleetCosts());
    expect(
      screen.getByRole('img', { name: 'Monthly costs' }),
    ).toBeInTheDocument();
    const summaryEl = screen.getByText('Show data table');
    const details = summaryEl.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the cost report' }),
    ).toHaveAttribute('href', '/costs');
  });

  it('shows one card when there is only one month', async () => {
    getFleetCostSummary.mockResolvedValue({
      ...summary,
      months: [summary.months[2]],
    });
    render(await FleetCosts());
    expect(screen.getByText(/This month/)).toBeInTheDocument();
    expect(screen.queryByText(/Last month/)).toBeNull();
  });

  it('shows an empty state without a chart when every total is zero', async () => {
    getFleetCostSummary.mockResolvedValue({
      ...summary,
      months: summary.months.map((m) => month(m.month, '0.00', '0.00', '0.00')),
    });
    render(await FleetCosts());
    expect(
      screen.getByRole('heading', {
        name: 'No costs recorded in the last 12 months',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Show data table')).toBeNull();
  });

  it('shows NotAllowed on a 403', async () => {
    getFleetCostSummary.mockRejectedValue(apiError(403));
    render(await FleetCosts());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });

  it('shows a generic error with the reference on a 5xx', async () => {
    getFleetCostSummary.mockRejectedValue(apiError(500));
    render(await FleetCosts());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Costs are unavailable');
    expect(alert).toHaveTextContent('Reference: req-9');
  });

  it('shows a generic error on a connection error', async () => {
    getFleetCostSummary.mockRejectedValue(new ApiConnectionError('timeout'));
    render(await FleetCosts());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Costs are unavailable',
    );
  });

  it('rethrows a redirect', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    getFleetCostSummary.mockRejectedValue(redirect);
    await expect(FleetCosts()).rejects.toBe(redirect);
  });

  it('does not break the counts section when it fails', async () => {
    getFleetDashboard.mockResolvedValue({
      asOf: '2026-10-08',
      vehicles: {
        total: 1,
        serviceStatus: { OK: 1, DUE_SOON: 0, OVERDUE: 0, UNKNOWN: 0 },
      },
      drivers: {
        total: 1,
        licenseStatus: { VALID: 1, EXPIRING_SOON: 0, EXPIRED: 0 },
      },
      assignments: { active: 0 },
    });
    getFleetCostSummary.mockRejectedValue(apiError(500));
    render(
      <>
        {await FleetOverview()}
        {await FleetCosts()}
      </>,
    );
    expect(screen.getByRole('link', { name: 'Vehicles' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Costs are unavailable',
    );
  });
});
