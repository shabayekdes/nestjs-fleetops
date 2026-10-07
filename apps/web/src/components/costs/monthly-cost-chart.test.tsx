// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CostSummary, CostSummaryMonth } from '@/lib/api/types';
import { MonthlyCostChart } from './monthly-cost-chart';

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
    fuelLiters: '0.000',
    totalCost,
  };
}

function summaryOf(months: CostSummaryMonth[]): CostSummary {
  return {
    from: months[0]?.month ?? '2026-01',
    to: months[months.length - 1]?.month ?? '2026-01',
    months,
    totals: {
      maintenanceCost: '0.00',
      fuelCost: '0.00',
      fuelLiters: '0.000',
      totalCost: '0.00',
    },
  };
}

const three = summaryOf([
  month('2026-01', '1000.50', '200.00', '1200.50'),
  month('2026-02', '0.00', '0.00', '0.00'),
  month('2026-03', '10.00', '5.00', '15.00'),
]);

function twelveMore(count: number) {
  return summaryOf(
    Array.from({ length: count }, (_, i) =>
      month(
        `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
        '10.00',
        '5.00',
        '15.00',
      ),
    ),
  );
}

function groups(container: HTMLElement) {
  return container.querySelectorAll('g[data-month]');
}

describe('MonthlyCostChart', () => {
  it('is an image with an accessible name and description', () => {
    render(<MonthlyCostChart summary={three} />);
    const chart = screen.getByRole('img', { name: 'Monthly costs' });
    expect(chart).toHaveAccessibleDescription(
      'Monthly maintenance and fuel costs, Jan 2026–Mar 2026. The data table lists the values.',
    );
    expect(chart).toHaveAttribute('viewBox');
    expect(chart).not.toHaveAttribute('width');
  });

  it('draws one bar group per month with a formatted title', () => {
    const { container } = render(<MonthlyCostChart summary={three} />);
    const bars = groups(container);
    expect(bars).toHaveLength(3);
    expect(bars[0]?.querySelector(':scope > title')?.textContent).toBe(
      'Jan 2026: maintenance 1,000.50, fuel 200.00, total 1,200.50',
    );
    expect(bars[2]?.querySelector(':scope > title')?.textContent).toBe(
      'Mar 2026: maintenance 10.00, fuel 5.00, total 15.00',
    );
  });

  it('renders a zero month as zero-height segments', () => {
    const { container } = render(<MonthlyCostChart summary={three} />);
    const zero = groups(container)[1] as Element;
    expect(zero.querySelector(':scope > title')?.textContent).toBe(
      'Feb 2026: maintenance 0.00, fuel 0.00, total 0.00',
    );
    for (const rect of zero.querySelectorAll('rect')) {
      expect(rect).toHaveAttribute('height', '0');
    }
  });

  it('stacks fuel on top of maintenance in the two theme colours', () => {
    const { container } = render(<MonthlyCostChart summary={three} />);
    const [maintenance, fuel] = Array.from(
      (groups(container)[0] as Element).querySelectorAll('rect'),
    );
    expect(maintenance).toHaveAttribute('fill', 'var(--chart-1)');
    expect(fuel).toHaveAttribute('fill', 'var(--chart-2)');
    const bottom =
      Number(maintenance?.getAttribute('y')) +
      Number(maintenance?.getAttribute('height'));
    const fuelBottom =
      Number(fuel?.getAttribute('y')) + Number(fuel?.getAttribute('height'));
    expect(fuelBottom).toBeCloseTo(Number(maintenance?.getAttribute('y')));
    expect(bottom).toBeGreaterThan(fuelBottom);
  });

  it('has a text legend', () => {
    render(<MonthlyCostChart summary={three} />);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Fuel')).toBeInTheDocument();
  });

  it('produces no NaN for a huge amount', () => {
    const { container } = render(
      <MonthlyCostChart
        summary={summaryOf([
          month('2026-01', '9999999999.99', '0.00', '9999999999.99'),
          month('2026-02', '1.00', '1.00', '2.00'),
        ])}
      />,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(groups(container)[0]?.querySelector('title')?.textContent).toContain(
      '9,999,999,999.99',
    );
  });

  it('survives an empty month list', () => {
    const { container } = render(<MonthlyCostChart summary={summaryOf([])} />);
    expect(groups(container)).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('labels every month up to 12 and every other month above', () => {
    const labelled = (container: HTMLElement) =>
      container.querySelectorAll('g[data-month] > text').length;
    expect(
      labelled(render(<MonthlyCostChart summary={twelveMore(12)} />).container),
    ).toBe(12);
    expect(
      labelled(render(<MonthlyCostChart summary={twelveMore(24)} />).container),
    ).toBe(12);
  });
});
