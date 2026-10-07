import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { MaintenanceRecord } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { utcDateFromToday } from '@/lib/date-only';
import { isUuid } from '@/lib/ids';
import { canManageVehicleRecords } from '../../../../_lib/permissions';
import { MaintenanceForm } from '../../_components/maintenance-form';
import { maintenancePath } from '../../_lib/list-params';
import { getMaintenanceRecord } from '../../_lib/maintenance-api';
import {
  maintenanceInputToValues,
  maintenanceRecordToInput,
} from '../../_lib/maintenance-schema';
import { updateMaintenanceRecord } from '../../actions';

export const metadata: Metadata = { title: 'Edit maintenance record' };

export default async function EditMaintenanceRecordPage({
  params,
}: PageProps<'/vehicles/[id]/maintenance/[recordId]/edit'>) {
  const title = 'Edit maintenance record';
  const user = await getCurrentUser();
  // Before any fetch: a driver learns nothing about the record.
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

  let record: MaintenanceRecord;
  try {
    record = await getMaintenanceRecord(id, recordId);
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

  const original = maintenanceRecordToInput(record);

  return (
    <>
      <PageHeader title={title} />
      <MaintenanceForm
        action={updateMaintenanceRecord.bind(null, id, recordId, original)}
        initialValues={maintenanceInputToValues(original)}
        maxDate={utcDateFromToday(1)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={maintenancePath(id)}
      />
    </>
  );
}
