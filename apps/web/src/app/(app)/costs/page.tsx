import type { Metadata } from 'next';
import Link from 'next/link';
import { CostRangeForm } from '@/components/costs/cost-range-form';
import { CostSummaryTable } from '@/components/costs/cost-summary-table';
import { MonthlyCostChart } from '@/components/costs/monthly-cost-chart';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { CostSummary } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { parseCostParams } from '@/lib/costs/cost-params';
import { getFleetCostSummary } from '@/lib/costs/cost-summary-api';
import { formatMonth } from '@/lib/format';
import { canViewFleetCosts } from './_lib/permissions';

export const metadata: Metadata = { title: 'Costs' };

const PATH = '/costs';

export default async function FleetCostsPage({
  searchParams,
}: PageProps<'/costs'>) {
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about fleet costs.
  if (!canViewFleetCosts(user.role)) {
    return (
      <>
        <PageHeader title="Costs" />
        <NotAllowed />
      </>
    );
  }

  const raw = await searchParams;
  const { query, ignored } = parseCostParams(raw);

  let summary: CostSummary;
  try {
    summary = await getFleetCostSummary(query);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="Costs" />
            <NotAllowed />
          </>
        );
      }
      if (error.status === 400) {
        return (
          <>
            <PageHeader title="Costs" />
            <ErrorState
              title="This range could not be applied"
              message={error.message}
              reference={error.requestId ?? undefined}
              action={
                <Button variant="outline" asChild>
                  <Link href={PATH}>Reset</Link>
                </Button>
              }
            />
          </>
        );
      }
    }
    throw error;
  }

  const isEmpty =
    summary.totals.totalCost === '0.00' &&
    summary.totals.fuelLiters === '0.000';

  return (
    <>
      <PageHeader
        title="Costs"
        description={`Whole fleet · ${formatMonth(summary.from)} – ${formatMonth(summary.to)}`}
      />
      {ignored.length > 0 ? (
        <div className="mb-4">
          <Notice variant="warning">
            Some values in the address were not valid and were ignored.
          </Notice>
        </div>
      ) : null}
      <CostRangeForm path={PATH} from={summary.from} to={summary.to} />
      {isEmpty ? (
        <EmptyState
          title="No costs recorded in this period"
          description="Add maintenance records or fuel logs to a vehicle to see costs here."
        />
      ) : (
        <>
          <MonthlyCostChart summary={summary} />
          <CostSummaryTable summary={summary} />
        </>
      )}
    </>
  );
}
