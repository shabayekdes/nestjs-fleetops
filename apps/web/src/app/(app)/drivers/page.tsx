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
import type { DriverList } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { singleParam } from '@/lib/search-params';
import { DriverFilters } from './_components/driver-filters';
import { DriversTable } from './_components/drivers-table';
import { listDrivers } from './_lib/drivers-api';
import {
  driverListHref,
  driverListParams,
  parseDriverListParams,
} from './_lib/list-params';
import { canManageDrivers } from './_lib/permissions';

export const metadata: Metadata = { title: 'Drivers' };

export default async function DriversPage({
  searchParams,
}: PageProps<'/drivers'>) {
  const raw = await searchParams;
  const user = await getCurrentUser();
  // Before any drivers fetch: a driver learns nothing.
  if (!canManageDrivers(user.role)) {
    return (
      <>
        <PageHeader title="Drivers" />
        <NotAllowed />
      </>
    );
  }

  const { query, ignored, hasFilters } = parseDriverListParams(raw);
  const flash = flashMessage(singleParam(raw.notice));

  const addButton = (
    <Button asChild>
      <Link href="/drivers/new">Add driver</Link>
    </Button>
  );
  const header = <PageHeader title="Drivers" actions={addButton} />;

  let result: DriverList;
  try {
    result = await listDrivers(query);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <>
          <PageHeader title="Drivers" />
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
                <Link href="/drivers">Clear filters</Link>
              </Button>
            }
          />
        </>
      );
    }
    throw error;
  }

  const { data, meta } = result;

  const clearHref = driverListHref({ limit: query.limit });

  let body;
  if (meta.total === 0 && !hasFilters) {
    body = (
      <EmptyState
        title="No drivers yet"
        description="Add the first driver to start assigning vehicles."
        action={addButton}
      />
    );
  } else if (meta.total === 0) {
    body = (
      <EmptyState
        title="No drivers match these filters"
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
        title="No drivers on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={driverListHref(query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <DriversTable drivers={data} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname="/drivers"
          params={driverListParams({ ...query, page: undefined })}
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
            Some values in the address were not valid and were ignored.
          </Notice>
        ) : null}
      </div>
      <div className="mt-4">
        <DriverFilters query={query} />
        {body}
      </div>
    </>
  );
}
