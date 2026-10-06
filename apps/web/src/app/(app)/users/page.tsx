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
import type { UserList } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { singleParam } from '@/lib/search-params';
import { UserFilters } from './_components/user-filters';
import { UsersTable } from './_components/users-table';
import {
  parseUserListParams,
  userListHref,
  userListParams,
} from './_lib/list-params';
import { canManageUsers } from './_lib/permissions';
import { listUsers } from './_lib/users-api';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage({ searchParams }: PageProps<'/users'>) {
  const raw = await searchParams;
  const user = await getCurrentUser();

  // Before any fetch: only admins can list users.
  if (!canManageUsers(user.role)) {
    return (
      <>
        <PageHeader title="Users" />
        <NotAllowed />
      </>
    );
  }

  const { query, ignored, hasFilters } = parseUserListParams(raw);
  const flash = flashMessage(singleParam(raw.notice));

  const header = (
    <PageHeader
      title="Users"
      actions={
        <Button asChild>
          <Link href="/users/new">Add user</Link>
        </Button>
      }
    />
  );

  let result: UserList;
  try {
    result = await listUsers(query);
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
                <Link href="/users">Clear filters</Link>
              </Button>
            }
          />
        </>
      );
    }
    throw error;
  }

  const { data, meta } = result;
  const clearHref = userListHref({ limit: query.limit });

  let body;
  if (meta.total === 0 && hasFilters) {
    body = (
      <EmptyState
        title="No users match this role"
        action={
          <Button variant="outline" asChild>
            <Link href={clearHref}>Clear filters</Link>
          </Button>
        }
      />
    );
  } else if (meta.total === 0) {
    body = <EmptyState title="No users found" />;
  } else if (data.length === 0) {
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.limit));
    body = (
      <EmptyState
        title="No users on this page"
        action={
          <Button variant="outline" asChild>
            <Link href={userListHref(query, { page: lastPage })}>
              Go to the last page
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <UsersTable users={data} currentUserId={user.id} />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          pathname="/users"
          params={userListParams({ ...query, page: undefined })}
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
        <UserFilters query={query} />
        {body}
      </div>
    </>
  );
}
