import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { FuelLog } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { utcDateFromToday } from '@/lib/date-only';
import { isUuid } from '@/lib/ids';
import { canManageVehicleRecords } from '../../../../_lib/permissions';
import { FuelForm } from '../../_components/fuel-form';
import { getFuelLog } from '../../_lib/fuel-api';
import { fuelInputToValues, fuelLogToInput } from '../../_lib/fuel-schema';
import { fuelPath } from '../../_lib/list-params';
import { updateFuelLog } from '../../actions';

export const metadata: Metadata = { title: 'Edit fuel log' };

export default async function EditFuelLogPage({
  params,
}: PageProps<'/vehicles/[id]/fuel/[recordId]/edit'>) {
  const title = 'Edit fuel log';
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about the log.
  if (!canManageVehicleRecords(user.role)) {
    return (
      <>
        <PageHeader title={title} />
        <NotAllowed />
      </>
    );
  }

  const { id, recordId } = await params;
  if (!isUuid(id) || !isUuid(recordId)) notFound();

  let log: FuelLog;
  try {
    log = await getFuelLog(id, recordId);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title={title} />
            <NotAllowed />
          </>
        );
      }
    }
    throw error;
  }

  const original = fuelLogToInput(log);

  return (
    <>
      <PageHeader title={title} />
      <FuelForm
        action={updateFuelLog.bind(null, id, recordId, original)}
        initialValues={fuelInputToValues(original)}
        maxDate={utcDateFromToday(1)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={fuelPath(id)}
      />
    </>
  );
}
