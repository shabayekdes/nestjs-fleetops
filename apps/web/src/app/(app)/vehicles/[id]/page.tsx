import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { Vehicle } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { formatDateTime } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { singleParam } from '@/lib/search-params';
import { canManageVehicles } from '../_lib/permissions';
import { getVehicle } from '../_lib/vehicles-api';
import { DeleteVehicleButton } from './delete-vehicle-button';

export const metadata: Metadata = { title: 'Vehicle' };

export default async function VehicleDetailPage({
  params,
  searchParams,
}: PageProps<'/vehicles/[id]'>) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;
  const user = await getCurrentUser();

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

  const canManage = canManageVehicles(user.role);
  const flash = flashMessage(singleParam(raw.notice));
  const rows: [string, string][] = [
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Year', String(vehicle.year)],
    ['VIN', vehicle.vin],
    ['License plate', vehicle.licensePlate ?? 'Not registered'],
    ['Created', formatDateTime(vehicle.createdAt)],
    ['Last updated', formatDateTime(vehicle.updatedAt)],
  ];

  return (
    <>
      <PageHeader
        title={`${vehicle.make} ${vehicle.model}`}
        actions={
          canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/vehicles/${vehicle.id}/edit`}>Edit</Link>
              </Button>
              <DeleteVehicleButton
                id={vehicle.id}
                make={vehicle.make}
                model={vehicle.model}
                vin={vehicle.vin}
              />
            </>
          ) : undefined
        }
      />
      {flash ? (
        <div className="mb-4">
          <Notice variant="success">{flash}</Notice>
        </div>
      ) : null}
      <dl className="grid max-w-xl grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={label === 'VIN' ? 'font-mono' : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-8">
        <Link href="/vehicles" className="text-sm underline">
          Back to vehicles
        </Link>
      </p>
    </>
  );
}
