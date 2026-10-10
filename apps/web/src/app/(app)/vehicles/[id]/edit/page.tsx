import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { ApiError } from '@/lib/api/errors';
import type { Vehicle } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isUuid } from '@/lib/ids';
import {
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
} from '@/lib/master-data/master-data-api';
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
    makeId: vehicle.make.id,
    modelId: vehicle.model.id,
    vehicleTypeId: vehicle.vehicleType.id,
    year: vehicle.year,
    vin: vehicle.vin,
    licensePlate: vehicle.licensePlate,
  };

  const [makes, vehicleTypes] = await Promise.all([
    listVehicleMakes(),
    listVehicleTypes(),
  ]);
  // A retired make offers no models: the form appends only the vehicle's own
  // model, labelled "(retired)".
  const makeIsActive = makes.data.some(({ id }) => id === vehicle.make.id);
  const models = makeIsActive
    ? (await listVehicleModels(vehicle.make.id)).data
    : [];

  return (
    <>
      <PageHeader title="Edit vehicle" />
      <VehicleForm
        action={updateVehicle.bind(null, id, original)}
        initialValues={{
          makeId: original.makeId,
          modelId: original.modelId,
          vehicleTypeId: original.vehicleTypeId,
          year: String(original.year),
          vin: original.vin,
          licensePlate: original.licensePlate ?? '',
        }}
        makes={makes.data}
        vehicleTypes={vehicleTypes.data}
        initialModels={models}
        current={{
          make: vehicle.make,
          model: vehicle.model,
          vehicleType: vehicle.vehicleType,
        }}
        maxYear={maxVehicleYear()}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/vehicles/${id}`}
      />
    </>
  );
}
