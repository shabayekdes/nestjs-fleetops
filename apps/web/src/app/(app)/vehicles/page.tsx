import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { VehicleList } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { singleParam } from '@/lib/search-params';
import { VehicleFilters } from './_components/vehicle-filters';
import { VehiclesTable } from './_components/vehicles-table';
import {
  maxVehicleYear,
  parseVehicleListParams,
  vehicleListHref,
  vehicleListParams,
} from './_lib/list-params';
import { canManageVehicles } from './_lib/permissions';
import { listVehicles } from './_lib/vehicles-api';

export const metadata: Metadata = { title: 'Vehicles' };

export default async function VehiclesPage({
  searchParams,
}: PageProps<'/vehicles'>) {
  const raw = await searchParams;
  const user = await getCurrentUser();
  const canManage = canManageVehicles(user.role);
  const { query, ignored, hasFilters } = parseVehicleListParams(raw);
  const flash = flashMessage(singleParam(raw.notice));

  const header = (
    <PageHeader
      title="Vehicles"
      actions={
        canManage ? (
          <Button asChild>
            <Link href="/vehicles/new">Add vehicle</Link>
          </Button>
        ) : undefined
      }
    />
  );

  let result: VehicleList;
  try {
    result = await listVehicles(query);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <>
          {header}
          <NotAllowed />
        </>
      );
    }
    if (error instanceof ApiError && error.status === 400) {
      return (
        <>
          {header}
          <ErrorState
            title="These filters could not be applied"
            message="Clear the filters and try again."
            reference={error.requestId ?? undefined}
            action={
              <Button variant="outline" asChild>
                <Link href="/vehicles">Clear filters</Link>
              </Button>
            }
          />
        </>
      );
    }
    throw error;
  }

  const { data, meta } = result;
  const clearHref = vehicleListHref({ limit: query.limit });

  let body;
  if (meta.total === 0 && !hasFilters) {
    body = (
      <EmptyState
        title="No vehicles yet"
        description={
          canManage
            ? 'Add the first vehicle to start tracking your fleet.'
            : undefined
        }
        action={
          canManage ? (
            <Button asChild>
              <Link href="/vehicles/new">Add vehicle</Link>
            </Button>
          ) : undefined
        }
      />
    );
  } else if (meta.total === 0) {
    body = (
      <EmptyState
        title="No vehicles match these filters"
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
        title="No vehicles on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={vehicleListHref(query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <VehiclesTable vehicles={data} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname="/vehicles"
          params={vehicleListParams({ ...query, page: undefined })}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        {flash ? <Notice variant="success">{flash}</Notice> : null}
        {ignored.length > 0 ? (
          <Notice variant="warning">
            Some filters in the address were not valid and were ignored.
          </Notice>
        ) : null}
      </div>
      <div className="mt-4">
        <VehicleFilters query={query} maxYear={maxVehicleYear()} />
        {body}
      </div>
    </>
  );
}
