import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
import { getCostSummary } from '@/lib/costs/cost-summary-api';
import { formatMonth } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { startEarly } from '@/lib/start-early';
import { VehicleSectionNav } from '../../_components/vehicle-section-nav';
import { loadVehicle } from '../../_lib/load-vehicle';
import { canManageVehicleRecords } from '../../_lib/permissions';

export const metadata: Metadata = { title: 'Costs' };

export default async function CostsPage({
  params,
  searchParams,
}: PageProps<'/vehicles/[id]/costs'>) {
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about the vehicle.
  if (!canManageVehicleRecords(user.role)) {
    return (
      <>
        <PageHeader title="Costs" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;

  // Independent of the vehicle: start now, await after it so a 404/403 on the
  // vehicle still wins.
  const { query, ignored } = parseCostParams(raw);
  const summaryRequest = startEarly(getCostSummary(id, query));

  const loaded = await loadVehicle(id);
  if (loaded.kind === 'forbidden') {
    return (
      <>
        <PageHeader title="Costs" />
        <NotAllowed />
      </>
    );
  }
  const { vehicle } = loaded;
  const name = `${vehicle.make} ${vehicle.model}`;
  const path = `/vehicles/${id}/costs`;

  let summary: CostSummary;
  try {
    summary = await summaryRequest;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="Costs" description={name} />
            <NotAllowed />
          </>
        );
      }
      if (error.status === 400) {
        return (
          <>
            <PageHeader title="Costs" description={name} />
            <VehicleSectionNav vehicleId={id} current="costs" />
            <ErrorState
              title="This range could not be applied"
              message={error.message}
              reference={error.requestId ?? undefined}
              action={
                <Button variant="outline" asChild>
                  <Link href={path}>Reset</Link>
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
        description={`${name} · ${formatMonth(summary.from)} – ${formatMonth(summary.to)}`}
      />
      <VehicleSectionNav vehicleId={id} current="costs" />
      {ignored.length > 0 ? (
        <div className="mb-4">
          <Notice variant="warning">
            Some values in the address were not valid and were ignored.
          </Notice>
        </div>
      ) : null}
      <CostRangeForm path={path} from={summary.from} to={summary.to} />
      {isEmpty ? (
        <EmptyState
          title="No costs recorded in this period"
          description="Add maintenance records or fuel logs to see costs here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href={`/vehicles/${id}/maintenance/new`}>
                  Add maintenance record
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/vehicles/${id}/fuel/new`}>Add fuel log</Link>
              </Button>
            </div>
          }
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
