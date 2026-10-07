import Link from 'next/link';
import { CostSummaryTable } from '@/components/costs/cost-summary-table';
import { MonthlyCostChart } from '@/components/costs/monthly-cost-chart';
import { EmptyState } from '@/components/empty-state';
import type { CostSummary, CostSummaryMonth } from '@/lib/api/types';
import { getFleetCostSummary } from '@/lib/costs/cost-summary-api';
import { formatDecimal, formatMonth } from '@/lib/format';
import { sectionError } from './section-error';

function isZeroAmount(value: string): boolean {
  return /^0*(\.0*)?$/.test(value);
}

function MonthCard({
  label,
  month,
}: {
  label: string;
  month: CostSummaryMonth;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-muted-foreground text-sm">
        {label} <span>({formatMonth(month.month)})</span>
      </h3>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {formatDecimal(month.totalCost, 2)}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        Maintenance {formatDecimal(month.maintenanceCost, 2)} · Fuel{' '}
        {formatDecimal(month.fuelCost, 2)}
      </p>
    </div>
  );
}

/**
 * The fleet's costs over the API's default range (the last 12 months). This
 * month and last month are the last two rows, shown side by side as the API
 * sent them: no percentage and no arithmetic on decimals.
 */
export async function FleetCosts() {
  let summary: CostSummary;
  try {
    summary = await getFleetCostSummary({});
  } catch (error) {
    return sectionError(error, 'Costs are unavailable');
  }

  if (summary.months.every((month) => isZeroAmount(month.totalCost))) {
    return (
      <EmptyState
        title="No costs recorded in the last 12 months"
        description="Add maintenance records or fuel logs to see costs here."
      />
    );
  }

  const thisMonth = summary.months[summary.months.length - 1];
  const lastMonth = summary.months[summary.months.length - 2];

  return (
    <section aria-labelledby="costs-heading" className="space-y-4">
      <h2 id="costs-heading" className="text-lg font-medium">
        Costs
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {thisMonth ? <MonthCard label="This month" month={thisMonth} /> : null}
        {lastMonth ? <MonthCard label="Last month" month={lastMonth} /> : null}
      </div>
      <MonthlyCostChart summary={summary} />
      <details>
        <summary className="cursor-pointer text-sm underline underline-offset-4">
          Show data table
        </summary>
        <div className="mt-3">
          <CostSummaryTable summary={summary} />
        </div>
      </details>
      <p>
        <Link href="/costs" className="text-sm underline">
          Open the cost report
        </Link>
      </p>
    </section>
  );
}
