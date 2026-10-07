// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const getCostSummary = vi.hoisted(() => vi.fn());
const loadVehicle = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/costs/cost-summary-api', () => ({ getCostSummary }));
vi.mock('../../_lib/load-vehicle', () => ({ loadVehicle }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
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

import CostsPage from './page';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const vehicle = { id: ID, make: 'Ford', model: 'Transit' };

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
  from: '2025-03',
  to: '2026-02',
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
  id: string = ID,
) {
  render(
    await CostsPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  loadVehicle.mockReset();
  loadVehicle.mockResolvedValue({ kind: 'ok', vehicle });
  getCostSummary.mockReset();
  getCostSummary.mockResolvedValue(summary);
});

describe('CostsPage', () => {
  it('shows NotAllowed to a driver before any fetch', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(getCostSummary).not.toHaveBeenCalled();
  });

  it('calls notFound for a malformed id without a fetch', async () => {
    await expect(renderPage({}, 'nope')).rejects.toThrow('NOT_FOUND');
    expect(loadVehicle).not.toHaveBeenCalled();
    expect(getCostSummary).not.toHaveBeenCalled();
  });

  it('calls notFound when the summary answers 404', async () => {
    getCostSummary.mockRejectedValue(apiError(404));
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
  });

  it('shows NotAllowed when forbidden and rethrows a 500', async () => {
    loadVehicle.mockResolvedValueOnce({ kind: 'forbidden' });
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    document.body.innerHTML = '';
    getCostSummary.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    getCostSummary.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });

  it('shows the API message for a 400 with a Reset link', async () => {
    getCostSummary.mockRejectedValue(
      apiError(400, 'The range must not exceed 24 months'),
    );
    await renderPage({ from: '2020-01', to: '2026-01' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The range must not exceed 24 months',
    );
    expect(screen.getByRole('link', { name: 'Reset' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/costs`,
    );
  });

  it('passes only the valid range to the API', async () => {
    await renderPage({ from: '2025-03', to: 'garbage' });
    expect(getCostSummary).toHaveBeenCalledWith(ID, { from: '2025-03' });
    expect(
      screen.getByText(
        'Some values in the address were not valid and were ignored.',
      ),
    ).toBeInTheDocument();
    document.body.innerHTML = '';
    await renderPage();
    expect(getCostSummary).toHaveBeenLastCalledWith(ID, {});
  });

  it('shows the range from the response in the header, the nav and the table', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Costs' })).toBeInTheDocument();
    expect(
      screen.getByText('Ford Transit · Mar 2025 – Feb 2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Costs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByLabelText('From')).toHaveValue('2025-03');
    expect(screen.getByLabelText('To')).toHaveValue('2026-02');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Monthly costs/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('150.00').length).toBeGreaterThan(0);
  });

  it('shows the empty state with add links when nothing was recorded', async () => {
    getCostSummary.mockResolvedValue(emptySummary);
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'No costs recorded in this period' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Add maintenance record' }),
    ).toHaveAttribute('href', `/vehicles/${ID}/maintenance/new`);
    expect(screen.getByRole('link', { name: 'Add fuel log' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/fuel/new`,
    );
  });

  it('shows the table when only fuel liters are non-zero', async () => {
    getCostSummary.mockResolvedValue({
      ...emptySummary,
      totals: { ...emptySummary.totals, fuelLiters: '1.000' },
    });
    await renderPage();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
