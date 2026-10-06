import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignmentSection } from '@/components/assignments/assignment-section';
import { LicenseStatusBadge } from '@/components/license-status-badge';
import { NotAllowed } from '@/components/not-allowed';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import type { Driver } from '@/lib/api/types';
import { assignVehicleToDriver } from '@/lib/assignments/actions';
import { loadAssignmentSection } from '@/lib/assignments/assignments-api';
import { vehicleOptions } from '@/lib/assignments/options';
import { parseAssignmentsPage } from '@/lib/assignments/page-param';
import { getCurrentUser } from '@/lib/auth/current-user';
import { flashMessage } from '@/lib/flash';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { licenseStatus } from '@/lib/license-status';
import { singleParam } from '@/lib/search-params';
import { getDriver } from '../_lib/drivers-api';
import { canManageDrivers } from '../_lib/permissions';
import { DeleteDriverButton } from './delete-driver-button';

export const metadata: Metadata = { title: 'Driver' };

export default async function DriverDetailPage({
  params,
  searchParams,
}: PageProps<'/drivers/[id]'>) {
  const current = await getCurrentUser();
  // Before any driver fetch: a driver learns nothing about the driver.
  if (!canManageDrivers(current.role)) {
    return (
      <>
        <PageHeader title="Driver" />
        <NotAllowed />
      </>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const raw = await searchParams;

  let driver: Driver;
  try {
    driver = await getDriver(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) {
        return (
          <>
            <PageHeader title="Driver" />
            <NotAllowed />
          </>
        );
      }
    }
    throw error;
  }

  const section = await loadAssignmentSection(
    { driverId: id },
    parseAssignmentsPage(raw),
    { withOptions: true },
  );

  const name = `${driver.firstName} ${driver.lastName}`;
  const flash = flashMessage(singleParam(raw.notice));
  const expired = licenseStatus(driver.licenseExpiresOn) === 'expired';

  return (
    <>
      <PageHeader
        title={name}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/drivers/${driver.id}/edit`}>Edit</Link>
            </Button>
            <DeleteDriverButton
              id={driver.id}
              name={name}
              licenseNumber={driver.licenseNumber}
            />
          </>
        }
      />
      {flash ? (
        <div className="mb-4">
          <Notice variant="success">{flash}</Notice>
        </div>
      ) : null}
      <dl className="grid max-w-xl grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
        <dt className="text-muted-foreground">License number</dt>
        <dd className="font-mono">{driver.licenseNumber}</dd>
        <dt className="text-muted-foreground">License expires</dt>
        <dd>
          <span className="mr-2">
            {formatDateOnly(driver.licenseExpiresOn)}
          </span>
          <LicenseStatusBadge expiresOn={driver.licenseExpiresOn} />
        </dd>
        <dt className="text-muted-foreground">Login account</dt>
        <dd>
          {driver.userId ? (
            <>
              Linked
              {current.role === 'ADMIN' ? (
                <>
                  {' '}
                  <Link href={`/users/${driver.userId}`} className="underline">
                    View user
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            'Not linked'
          )}
        </dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDateTime(driver.createdAt)}</dd>
        <dt className="text-muted-foreground">Last updated</dt>
        <dd>{formatDateTime(driver.updatedAt)}</dd>
      </dl>

      <AssignmentSection
        perspective="driver"
        data={section}
        pathname={`/drivers/${driver.id}`}
        assignAction={assignVehicleToDriver.bind(null, driver.id)}
        options={
          section.kind === 'ok' && section.vehicleOptions
            ? vehicleOptions(section.vehicleOptions.data)
            : undefined
        }
        truncated={section.kind === 'ok' && section.vehicleOptions?.truncated}
        warning={
          expired
            ? `This driver's license expired on ${formatDateOnly(driver.licenseExpiresOn)}. New assignments will be refused until the expiry date is updated.`
            : undefined
        }
        emptyHint={{
          text: 'No vehicles yet.',
          href: '/vehicles/new',
          linkLabel: 'Add a vehicle',
        }}
      />

      <p className="mt-8">
        <Link href="/drivers" className="text-sm underline">
          Back to drivers
        </Link>
      </p>
    </>
  );
}
