import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import { utcDateFromToday } from '@/lib/date-only';
import { isUuid } from '@/lib/ids';
import { loadVehicle } from '../../../_lib/load-vehicle';
import { canManageVehicleRecords } from '../../../_lib/permissions';
import { FuelForm } from '../_components/fuel-form';
import { fuelPath } from '../_lib/list-params';
import { createFuelLog } from '../actions';

export const metadata: Metadata = { title: 'Add fuel log' };

export default async function NewFuelLogPage({
  params,
}: PageProps<'/vehicles/[id]/fuel/new'>) {
  const title = 'Add fuel log';
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
      <FuelForm
        action={createFuelLog.bind(null, id)}
        initialValues={{}}
        maxDate={utcDateFromToday(1)}
        submitLabel="Add fuel log"
        pendingLabel="Adding…"
        cancelHref={fuelPath(id)}
      />
    </>
  );
}
