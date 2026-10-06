import type { Metadata } from 'next';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createDriver } from '../actions';
import { DriverForm } from '../_components/driver-form';
import { canManageDrivers } from '../_lib/permissions';
import { loadUserPicker } from '../_lib/user-options';

export const metadata: Metadata = { title: 'Add driver' };

export default async function NewDriverPage() {
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing.
  if (!canManageDrivers(user.role)) {
    return (
      <>
        <PageHeader title="Add driver" />
        <NotAllowed />
      </>
    );
  }

  const picker = await loadUserPicker(user.role);

  return (
    <>
      <PageHeader title="Add driver" />
      <DriverForm
        action={createDriver}
        initialValues={{}}
        userOptions={picker.options}
        usersTruncated={picker.truncated}
        submitLabel="Create driver"
        pendingLabel="Creating…"
        cancelHref="/drivers"
      />
    </>
  );
}
