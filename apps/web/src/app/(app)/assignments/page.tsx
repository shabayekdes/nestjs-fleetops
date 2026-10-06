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
import type { AssignmentList } from '@/lib/api/types';
import { listAssignments } from '@/lib/assignments/assignments-api';
import { canManageAssignments } from '@/lib/assignments/permissions';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { singleParam } from '@/lib/search-params';
import { AssignmentFilters } from './_components/assignment-filters';
import { AssignmentsTable } from './_components/assignments-table';
import {
  assignmentListHref,
  assignmentListParams,
  parseAssignmentListParams,
} from './_lib/list-params';

export const metadata: Metadata = { title: 'Assignments' };

export default async function AssignmentsPage({
  searchParams,
}: PageProps<'/assignments'>) {
  const raw = await searchParams;
  const user = await getCurrentUser();
  const header = <PageHeader title="Assignments" />;
  // Before any assignments fetch: a driver learns nothing.
  if (!canManageAssignments(user.role)) {
    return (
      <>
        {header}
        <NotAllowed />
      </>
    );
  }

  const { query, ignored, hasFilters } = parseAssignmentListParams(raw);
  const flash = flashMessage(singleParam(raw.notice));

  let result: AssignmentList;
  try {
    result = await listAssignments(query);
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
                <Link href="/assignments">Clear filters</Link>
              </Button>
            }
          />
        </>
      );
    }
    throw error;
  }

  const { data, meta } = result;
  const clearHref = assignmentListHref({ limit: query.limit });

  let body;
  if (meta.total === 0 && !hasFilters) {
    body = (
      <EmptyState
        title="No assignments yet"
        description="Assign a driver from a vehicle or driver page."
      />
    );
  } else if (meta.total === 0) {
    body = (
      <EmptyState
        title="No assignments match this filter"
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
        title="No assignments on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={assignmentListHref(query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <AssignmentsTable assignments={data} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname="/assignments"
          params={assignmentListParams({ ...query, page: undefined })}
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
        <AssignmentFilters query={query} />
        {body}
      </div>
    </>
  );
}
