import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { LicenseStatusBadge } from '@/components/license-status-badge';
import { Button } from '@/components/ui/button';
import type { MyDashboard } from '@/lib/api/types';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { getMyDashboard } from '../_lib/dashboard-api';
import { sectionError } from './section-error';

const CARD = 'rounded-lg border p-4';

/** The signed-in driver's own vehicle and license. The API decides what is theirs. */
export async function DriverOverview() {
  let me: MyDashboard;
  try {
    me = await getMyDashboard();
  } catch (error) {
    return sectionError(error, 'Your overview is unavailable');
  }

  const { driver, currentAssignment } = me;

  return (
    <section aria-labelledby="my-heading" className="space-y-4">
      <h2 id="my-heading" className="sr-only">
        My overview
      </h2>
      {driver === null ? (
        <EmptyState title="Your account is not linked to a driver profile. Ask an administrator." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {currentAssignment ? (
            <div className={CARD}>
              <h3 className="text-muted-foreground text-sm">My vehicle</h3>
              <p className="mt-1 text-lg font-medium">
                <Link
                  href={`/vehicles/${encodeURIComponent(currentAssignment.vehicle.id)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {currentAssignment.vehicle.make}{' '}
                  {currentAssignment.vehicle.model}
                </Link>
              </p>
              {currentAssignment.vehicle.licensePlate ? (
                <p className="font-mono text-sm">
                  {currentAssignment.vehicle.licensePlate}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-1 text-sm">
                Since {formatDateTime(currentAssignment.startedAt)}
              </p>
            </div>
          ) : (
            <div className={CARD}>
              <h3 className="text-muted-foreground text-sm">My vehicle</h3>
              <p className="mt-1 text-sm">No vehicle is assigned to you.</p>
            </div>
          )}
          <div className={CARD}>
            <h3 className="text-muted-foreground text-sm">My license</h3>
            <p className="mt-1 font-mono text-sm">{driver.licenseNumber}</p>
            <p className="mt-1 text-sm">
              <span className="mr-2">
                Expires {formatDateOnly(driver.licenseExpiresOn)}
              </span>
              <LicenseStatusBadge status={driver.licenseStatus} />
            </p>
          </div>
        </div>
      )}
      <Button variant="outline" asChild>
        <Link href="/vehicles">Browse vehicles</Link>
      </Button>
    </section>
  );
}
