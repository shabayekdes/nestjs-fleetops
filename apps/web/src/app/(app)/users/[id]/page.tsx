import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { User } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatRole } from '@/lib/auth/roles';
import { flashMessage } from '@/lib/flash';
import { formatDateTime } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { singleParam } from '@/lib/search-params';
import { canManageUsers } from '../_lib/permissions';
import { getUser } from '../_lib/users-api';
import { DeleteUserButton } from './delete-user-button';

export const metadata: Metadata = { title: 'User' };

export default async function UserDetailPage({
  params,
  searchParams,
}: PageProps<'/users/[id]'>) {
  const current = await getCurrentUser();
  // Before any user fetch: a non-admin learns nothing about the user.
  if (!canManageUsers(current.role)) {
    return (
      <>
        <PageHeader title="User" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;

  let user: User;
  try {
    user = await getUser(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="User" />
            <NotAllowed />
          </>
        );
      }
    }
    throw error;
  }

  const isSelf = current.id === user.id;
  const name = `${user.firstName} ${user.lastName}`;
  const flash = flashMessage(singleParam(raw.notice));
  const rows: [string, string][] = [
    ['Name', name],
    ['Email', user.email],
    ['Role', formatRole(user.role)],
    ['Created', formatDateTime(user.createdAt)],
    ['Last updated', formatDateTime(user.updatedAt)],
  ];

  return (
    <>
      <PageHeader
        title={name}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/users/${user.id}/edit`}>Edit</Link>
            </Button>
            <DeleteUserButton
              id={user.id}
              name={name}
              email={user.email}
              isSelf={isSelf}
            />
          </>
        }
      />
      <div className="mb-4 space-y-4">
        {flash ? <Notice variant="success">{flash}</Notice> : null}
        {isSelf ? <Notice variant="info">This is your account.</Notice> : null}
      </div>
      <dl className="grid max-w-xl grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8">
        <Link href="/users" className="text-sm underline">
          Back to users
        </Link>
      </p>
    </>
  );
}
