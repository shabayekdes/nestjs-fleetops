import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AssignmentSection } from '@/components/assignments/assignment-section';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { ServiceStatusBadge } from '@/components/service-status-badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { Vehicle } from '@/lib/api/types';
import { assignDriverToVehicle } from '@/lib/assignments/actions';
import { loadAssignmentSection } from '@/lib/assignments/assignments-api';
import { driverOptions } from '@/lib/assignments/options';
import { parseAssignmentsPage } from '@/lib/assignments/page-param';
import { canManageAssignments } from '@/lib/assignments/permissions';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { singleParam } from '@/lib/search-params';
import { VehicleSectionNav } from '../_components/vehicle-section-nav';
import {
  canManageVehicleRecords,
  canManageVehicles,
} from '../_lib/permissions';
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
  // Drivers cannot use the assignment endpoints: no call and no section.
  const section = canManageAssignments(user.role)
    ? await loadAssignmentSection(
        { vehicleId: id },
        parseAssignmentsPage(raw),
        { withOptions: true },
      )
    : null;
  const flash = flashMessage(singleParam(raw.notice));
  const rows: [string, ReactNode][] = [
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Year', String(vehicle.year)],
    ['VIN', vehicle.vin],
    ['License plate', vehicle.licensePlate ?? 'Not registered'],
    [
      'Next service',
      vehicle.nextServiceDueOn
        ? formatDateOnly(vehicle.nextServiceDueOn)
        : 'Not scheduled',
    ],
    [
      'Service status',
      <ServiceStatusBadge
        key="service-status"
        status={vehicle.serviceStatus}
      />,
    ],
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
      {canManageVehicleRecords(user.role) ? (
        <VehicleSectionNav vehicleId={vehicle.id} current="overview" />
      ) : null}
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
      {section ? (
        <AssignmentSection
          perspective="vehicle"
          data={section}
          pathname={`/vehicles/${vehicle.id}`}
          assignAction={assignDriverToVehicle.bind(null, vehicle.id)}
          options={
            section.kind === 'ok' && section.driverOptions
              ? driverOptions(section.driverOptions.data)
              : undefined
          }
          truncated={section.kind === 'ok' && section.driverOptions?.truncated}
          emptyHint={{
            text: 'No drivers yet.',
            href: '/drivers/new',
            linkLabel: 'Add a driver',
          }}
        />
      ) : null}
      <p className="mt-8">
        <Link href="/vehicles" className="text-sm underline">
          Back to vehicles
        </Link>
      </p>
    </>
  );
}
