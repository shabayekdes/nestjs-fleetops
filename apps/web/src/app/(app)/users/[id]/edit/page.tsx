import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { User } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isUuid } from '@/lib/ids';
import { updateUser } from '../../actions';
import { UserForm } from '../../_components/user-form';
import { canManageUsers } from '../../_lib/permissions';
import { getUser } from '../../_lib/users-api';

export const metadata: Metadata = { title: 'Edit user' };

export default async function EditUserPage({
  params,
}: PageProps<'/users/[id]/edit'>) {
  const current = await getCurrentUser();
  // Before any user fetch: a non-admin learns nothing about the user.
  if (!canManageUsers(current.role)) {
    return (
      <>
        <PageHeader title="Edit user" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let user: User;
  try {
    user = await getUser(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="Edit user" />
            <NotAllowed />
          </>
        );
      }
    }
    throw error;
  }

  const original = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };

  return (
    <>
      <PageHeader title="Edit user" />
      <UserForm
        mode="edit"
        action={updateUser.bind(null, id, original)}
        initialValues={original}
        isSelf={current.id === user.id}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/users/${id}`}
      />
      <p className="text-muted-foreground mt-6 max-w-xl text-sm">
        Passwords are changed by each user on their account page.
      </p>
    </>
  );
}
