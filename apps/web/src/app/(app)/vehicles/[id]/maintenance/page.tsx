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
import type { MaintenanceRecordList } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import { singleParam } from '@/lib/search-params';
import { startEarly } from '@/lib/start-early';
import { VehicleSectionNav } from '../../_components/vehicle-section-nav';
import { loadVehicle } from '../../_lib/load-vehicle';
import { canManageVehicleRecords } from '../../_lib/permissions';
import { MaintenanceFilters } from './_components/maintenance-filters';
import { MaintenanceTable } from './_components/maintenance-table';
import {
  maintenanceListHref,
  maintenanceListParams,
  maintenancePath,
  parseMaintenanceListParams,
} from './_lib/list-params';
import { listMaintenanceRecords } from './_lib/maintenance-api';

export const metadata: Metadata = { title: 'Maintenance' };

export default async function MaintenancePage({
  params,
  searchParams,
}: PageProps<'/vehicles/[id]/maintenance'>) {
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about the vehicle.
  if (!canManageVehicleRecords(user.role)) {
    return (
      <>
        <PageHeader title="Maintenance" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;

  // Independent of the vehicle: start now, await after it so a 404/403 on the
  // vehicle still wins.
  const { query, ignored, hasFilters } = parseMaintenanceListParams(raw);
  const listing = startEarly(listMaintenanceRecords(id, query));

  const loaded = await loadVehicle(id);
  if (loaded.kind === 'forbidden') {
    return (
      <>
        <PageHeader title="Maintenance" />
        <NotAllowed />
      </>
    );
  }
  const { vehicle } = loaded;
  const newHref = `${maintenancePath(id)}/new`;

  const header = (
    <PageHeader
      title="Maintenance"
      description={`${vehicle.make.name} ${vehicle.model.name}`}
      actions={
        <Button asChild>
          <Link href={newHref}>Add record</Link>
        </Button>
      }
    />
  );

  const flash = flashMessage(singleParam(raw.notice));

  let result: MaintenanceRecordList;
  try {
    result = await listing;
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
            <VehicleSectionNav vehicleId={id} current="maintenance" />
            <ErrorState
              title="These filters could not be applied"
              message={error.message}
              reference={error.requestId ?? undefined}
              action={
                <Button variant="outline" asChild>
                  <Link href={maintenanceListHref(id, { limit: query.limit })}>
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
  const clearHref = maintenanceListHref(id, { limit: query.limit });

  let body;
  if (meta.total === 0 && !hasFilters) {
    body = (
      <EmptyState
        title="No maintenance records yet"
        description="Record the first service to track costs and the next service date."
        action={
          <Button asChild>
            <Link href={newHref}>Add record</Link>
          </Button>
        }
      />
    );
  } else if (meta.total === 0) {
    body = (
      <EmptyState
        title="No maintenance records match these filters"
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
        title="No records on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={maintenanceListHref(id, query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <MaintenanceTable vehicleId={id} records={data} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname={maintenancePath(id)}
          params={maintenanceListParams({ ...query, page: undefined })}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <VehicleSectionNav vehicleId={id} current="maintenance" />
      <div className="space-y-4">
        {flash ? <Notice variant="success">{flash}</Notice> : null}
        {ignored.length > 0 ? (
          <Notice variant="warning">
            Some filters in the address were not valid and were ignored.
          </Notice>
        ) : null}
      </div>
      <div className="mt-4">
        <MaintenanceFilters vehicleId={id} query={query} />
        {body}
      </div>
    </>
  );
}
