import type { Metadata } from 'next';
import { NotAllowed } from '@/components/not-allowed';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  listVehicleMakes,
  listVehicleTypes,
} from '@/lib/master-data/master-data-api';
import { createVehicle } from '../actions';
import { VehicleForm } from '../_components/vehicle-form';
import { maxVehicleYear } from '../_lib/list-params';
import { canManageVehicles } from '../_lib/permissions';

export const metadata: Metadata = { title: 'Add vehicle' };

export default async function NewVehiclePage() {
  const user = await getCurrentUser();
  if (!canManageVehicles(user.role)) {
    return (
      <>
        <PageHeader title="Add vehicle" />
        <NotAllowed />
      </>
    );
  }

  const [makes, vehicleTypes] = await Promise.all([
    listVehicleMakes(),
    listVehicleTypes(),
  ]);

  return (
    <>
      <PageHeader title="Add vehicle" />
      <VehicleForm
        action={createVehicle}
        initialValues={{}}
        makes={makes.data}
        vehicleTypes={vehicleTypes.data}
        maxYear={maxVehicleYear()}
        submitLabel="Create vehicle"
        pendingLabel="Creating…"
        cancelHref="/vehicles"
      />
    </>
  );
}
