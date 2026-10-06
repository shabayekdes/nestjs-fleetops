import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { Driver } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isUuid } from '@/lib/ids';
import { updateDriver } from '../../actions';
import { DriverForm } from '../../_components/driver-form';
import { getDriver } from '../../_lib/drivers-api';
import { canManageDrivers } from '../../_lib/permissions';
import { loadUserPicker } from '../../_lib/user-options';

export const metadata: Metadata = { title: 'Edit driver' };

export default async function EditDriverPage({
  params,
}: PageProps<'/drivers/[id]/edit'>) {
  const user = await getCurrentUser();
  // Before any driver fetch: a driver learns nothing about the driver.
  if (!canManageDrivers(user.role)) {
    return (
      <>
        <PageHeader title="Edit driver" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let driver: Driver;
  try {
    driver = await getDriver(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="Edit driver" />
            <NotAllowed />
          </>
        );
      }
    }
    throw error;
  }

  const picker = await loadUserPicker(user.role, driver.userId);
  const original = {
    firstName: driver.firstName,
    lastName: driver.lastName,
    licenseNumber: driver.licenseNumber,
    licenseExpiresOn: driver.licenseExpiresOn,
    userId: driver.userId,
  };

  return (
    <>
      <PageHeader title="Edit driver" />
      <DriverForm
        action={updateDriver.bind(null, id, original)}
        initialValues={{
          firstName: original.firstName,
          lastName: original.lastName,
          licenseNumber: original.licenseNumber,
          licenseExpiresOn: original.licenseExpiresOn,
          userId: original.userId ?? '',
        }}
        userOptions={picker.options}
        usersTruncated={picker.truncated}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/drivers/${id}`}
      />
    </>
  );
}
