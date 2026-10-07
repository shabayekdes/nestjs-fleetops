// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CostSummary } from '@/lib/api/types';
import { CostSummaryTable } from './cost-summary-table';

const summary: CostSummary = {
  from: '2026-01',
  to: '2026-03',
  months: [
    {
      month: '2026-01',
      maintenanceCost: '1000.50',
      fuelCost: '200.00',
      fuelLiters: '150.250',
      totalCost: '1200.50',
    },
    {
      month: '2026-02',
      maintenanceCost: '0.00',
      fuelCost: '0.00',
      fuelLiters: '0.000',
      totalCost: '0.00',
    },
    {
      month: '2026-03',
      maintenanceCost: '10.00',
      fuelCost: '5.00',
      fuelLiters: '3.000',
      totalCost: '15.00',
    },
  ],
  totals: {
    maintenanceCost: '1010.50',
    fuelCost: '205.00',
    fuelLiters: '153.250',
    totalCost: '1215.50',
  },
};

describe('CostSummaryTable', () => {
  it('has the five columns and an accessible caption', () => {
    render(<CostSummaryTable summary={summary} />);
    expect(
      screen.getAllByRole('columnheader').map((h) => h.textContent),
    ).toEqual(['Month', 'Maintenance', 'Fuel', 'Fuel (liters)', 'Total']);
    expect(
      screen.getByRole('table', { name: /Jan 2026 to Mar 2026/ }),
    ).toBeInTheDocument();
  });

  it('lists the months in the given order with formatted amounts', () => {
    render(<CostSummaryTable summary={summary} />);
    const rows = screen.getAllByRole('row');
    const cells = (i: number) =>
      within(rows[i] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    expect(cells(1)).toEqual([
      'Jan 2026',
      '1,000.50',
      '200.00',
      '150.250',
      '1,200.50',
    ]);
    expect(cells(2)?.[0]).toBe('Feb 2026');
    expect(cells(3)?.[0]).toBe('Mar 2026');
    expect(screen.getByText('1,000.50')).toHaveClass(
      'tabular-nums',
      'text-right',
    );
  });

  it('shows a Total row from the API totals', () => {
    render(<CostSummaryTable summary={summary} />);
    const rows = screen.getAllByRole('row');
    const footer = rows[rows.length - 1] as HTMLElement;
    expect(within(footer).getByRole('rowheader')).toHaveTextContent('Total');
    expect(
      within(footer)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1,010.50', '205.00', '153.250', '1,215.50']);
  });
});
