import type { Metadata } from 'next';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createUser } from '../actions';
import { UserForm } from '../_components/user-form';
import { canManageUsers } from '../_lib/permissions';

export const metadata: Metadata = { title: 'Add user' };

export default async function NewUserPage() {
  const user = await getCurrentUser();
  if (!canManageUsers(user.role)) {
    return (
      <>
        <PageHeader title="Add user" />
        <NotAllowed />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add user" />
      <UserForm
        mode="create"
        action={createUser}
        initialValues={{}}
        submitLabel="Create user"
        pendingLabel="Creating…"
        cancelHref="/users"
      />
    </>
  );
}
