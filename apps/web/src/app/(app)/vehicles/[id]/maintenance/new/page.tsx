import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import { utcDateFromToday } from '@/lib/date-only';
import { isUuid } from '@/lib/ids';
import { loadVehicle } from '../../../_lib/load-vehicle';
import { canManageVehicleRecords } from '../../../_lib/permissions';
import { MaintenanceForm } from '../_components/maintenance-form';
import { maintenancePath } from '../_lib/list-params';
import { createMaintenanceRecord } from '../actions';

export const metadata: Metadata = { title: 'Add maintenance record' };

export default async function NewMaintenanceRecordPage({
  params,
}: PageProps<'/vehicles/[id]/maintenance/new'>) {
  const title = 'Add maintenance record';
  const user = await getCurrentUser();
  if (!canManageVehicleRecords(user.role)) {
    return (
      <>
        <PageHeader title={title} />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const loaded = await loadVehicle(id);
  if (loaded.kind === 'forbidden') {
    return (
      <>
        <PageHeader title={title} />
        <NotAllowed />
      </>
    );
  }
  const { vehicle } = loaded;

  return (
    <>
      <PageHeader
        title={title}
        description={`${vehicle.make} ${vehicle.model}`}
      />
      <MaintenanceForm
        action={createMaintenanceRecord.bind(null, id)}
        initialValues={{}}
        maxDate={utcDateFromToday(1)}
        submitLabel="Add record"
        pendingLabel="Adding…"
        cancelHref={maintenancePath(id)}
      />
    </>
  );
}
