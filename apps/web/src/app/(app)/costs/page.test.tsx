// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getFleetCostSummary = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/costs/cost-summary-api', () => ({ getFleetCostSummary }));
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

import FleetCostsPage from './page';

const summary = {
  from: '2025-03',
  to: '2026-02',
  months: [
    {
      month: '2025-03',
      maintenanceCost: '100.00',
      fuelCost: '50.00',
      fuelLiters: '30.000',
      totalCost: '150.00',
    },
  ],
  totals: {
    maintenanceCost: '100.00',
    fuelCost: '50.00',
    fuelLiters: '30.000',
    totalCost: '150.00',
  },
};

const emptySummary = {
  ...summary,
  months: [
    {
      month: '2025-03',
      maintenanceCost: '0.00',
      fuelCost: '0.00',
      fuelLiters: '0.000',
      totalCost: '0.00',
    },
  ],
  totals: {
    maintenanceCost: '0.00',
    fuelCost: '0.00',
    fuelLiters: '0.000',
    totalCost: '0.00',
  },
};

function apiError(status: number, message = 'm') {
  return new ApiError({
    status,
    error: 'E',
    message,
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
    await FleetCostsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  getFleetCostSummary.mockReset();
  getFleetCostSummary.mockResolvedValue(summary);
});

describe('FleetCostsPage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage({ from: '2025-03' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(getFleetCostSummary).not.toHaveBeenCalled();
  });

  it('shows the range, the form, the chart and the full table', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Costs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Whole fleet · Mar 2025 – Feb 2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Cost range' })).toHaveAttribute(
      'action',
      '/costs',
    );
    expect(screen.getByLabelText('From')).toHaveValue('2025-03');
    expect(screen.getByLabelText('To')).toHaveValue('2026-02');
    expect(
      screen.getByRole('img', { name: 'Monthly costs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('rowheader', { name: 'Total' }),
    ).toBeInTheDocument();
  });

  it('passes only the valid range and shows a notice for the rest', async () => {
    await renderPage({ from: '2025-03', to: 'garbage' });
    expect(getFleetCostSummary).toHaveBeenCalledWith({ from: '2025-03' });
    expect(
      screen.getByText(
        'Some values in the address were not valid and were ignored.',
      ),
    ).toBeInTheDocument();
    document.body.innerHTML = '';
    await renderPage();
    expect(getFleetCostSummary).toHaveBeenLastCalledWith({});
  });

  it('shows the API message for a 400 with a Reset link', async () => {
    getFleetCostSummary.mockRejectedValue(
      apiError(400, 'The range must not exceed 24 months'),
    );
    await renderPage({ from: '2020-01', to: '2026-01' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The range must not exceed 24 months',
    );
    expect(screen.getByRole('link', { name: 'Reset' })).toHaveAttribute(
      'href',
      '/costs',
    );
  });

  it('shows NotAllowed on a 403 and rethrows a 500', async () => {
    getFleetCostSummary.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getFleetCostSummary.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('shows an empty state without a chart when nothing was recorded', async () => {
    getFleetCostSummary.mockResolvedValue(emptySummary);
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No costs recorded in this period' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
