import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { Vehicle } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isUuid } from '@/lib/ids';
import { updateVehicle } from '../../actions';
import { VehicleForm } from '../../_components/vehicle-form';
import { maxVehicleYear } from '../../_lib/list-params';
import { canManageVehicles } from '../../_lib/permissions';
import { getVehicle } from '../../_lib/vehicles-api';

export const metadata: Metadata = { title: 'Edit vehicle' };

export default async function EditVehiclePage({
  params,
}: PageProps<'/vehicles/[id]/edit'>) {
  const user = await getCurrentUser();
  // Before any vehicle fetch: a driver learns nothing about the vehicle.
  if (!canManageVehicles(user.role)) {
    return (
      <>
        <PageHeader title="Edit vehicle" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let vehicle: Vehicle;
  try {
    vehicle = await getVehicle(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) return <NotAllowed />;
    }
    throw error;
  }

  const original = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin,
    licensePlate: vehicle.licensePlate,
  };

  return (
    <>
      <PageHeader title="Edit vehicle" />
      <VehicleForm
        action={updateVehicle.bind(null, id, original)}
        initialValues={{
          make: original.make,
          model: original.model,
          year: String(original.year),
          vin: original.vin,
          licensePlate: original.licensePlate ?? '',
        }}
        maxYear={maxVehicleYear()}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/vehicles/${id}`}
      />
    </>
  );
}
