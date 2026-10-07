import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { FuelLogList } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import { singleParam } from '@/lib/search-params';
import { VehicleSectionNav } from '../../_components/vehicle-section-nav';
import { loadVehicle } from '../../_lib/load-vehicle';
import { canManageVehicleRecords } from '../../_lib/permissions';
import { FuelFilters } from './_components/fuel-filters';
import { FuelTable } from './_components/fuel-table';
import { listFuelLogs } from './_lib/fuel-api';
import {
  fuelListHref,
  fuelListParams,
  fuelPath,
  parseFuelListParams,
} from './_lib/list-params';

export const metadata: Metadata = { title: 'Fuel' };

export default async function FuelPage({
  params,
  searchParams,
}: PageProps<'/vehicles/[id]/fuel'>) {
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about the vehicle.
  if (!canManageVehicleRecords(user.role)) {
    return (
      <>
        <PageHeader title="Fuel" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;

  const loaded = await loadVehicle(id);
  if (loaded.kind === 'forbidden') {
    return (
      <>
        <PageHeader title="Fuel" />
        <NotAllowed />
      </>
    );
  }
  const { vehicle } = loaded;
  const newHref = `${fuelPath(id)}/new`;

  const header = (
    <PageHeader
      title="Fuel"
      description={`${vehicle.make} ${vehicle.model}`}
      actions={
        <Button asChild>
          <Link href={newHref}>Add fuel log</Link>
        </Button>
      }
    />
  );

  const { query, ignored, hasFilters } = parseFuelListParams(raw);
  const flash = flashMessage(singleParam(raw.notice));

  let result: FuelLogList;
  try {
    result = await listFuelLogs(id, query);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) notFound();
      if (error.status === 403) {
        return (
          <>
            {header}
            <NotAllowed />
          </>
        );
      }
      if (error.status === 400) {
        return (
          <>
            {header}
            <VehicleSectionNav vehicleId={id} current="fuel" />
            <ErrorState
              title="These filters could not be applied"
              message={error.message}
              reference={error.requestId ?? undefined}
              action={
                <Button variant="outline" asChild>
                  <Link href={fuelListHref(id, { limit: query.limit })}>
                    Clear filters
                  </Link>
                </Button>
              }
            />
          </>
        );
      }
    }
    throw error;
  }

  const { data, meta } = result;
  const clearHref = fuelListHref(id, { limit: query.limit });

  let body;
  if (meta.total === 0 && !hasFilters) {
    body = (
      <EmptyState
        title="No fuel logs yet"
        description="Record the first fill-up to track fuel use and costs."
        action={
          <Button asChild>
            <Link href={newHref}>Add fuel log</Link>
          </Button>
        }
      />
    );
  } else if (meta.total === 0) {
    body = (
      <EmptyState
        title="No fuel logs match these filters"
        action={
          <Button variant="outline" asChild>
            <Link href={clearHref}>Clear filters</Link>
          </Button>
        }
      />
    );
  } else if (data.length === 0) {
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.limit));
    body = (
      <EmptyState
        title="No fuel logs on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={fuelListHref(id, query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <FuelTable vehicleId={id} logs={data} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname={fuelPath(id)}
          params={fuelListParams({ ...query, page: undefined })}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <VehicleSectionNav vehicleId={id} current="fuel" />
      <div className="space-y-4">
        {flash ? <Notice variant="success">{flash}</Notice> : null}
        {ignored.length > 0 ? (
          <Notice variant="warning">
            Some filters in the address were not valid and were ignored.
          </Notice>
        ) : null}
      </div>
      <div className="mt-4">
        <FuelFilters vehicleId={id} query={query} />
        {body}
      </div>
    </>
  );
}
