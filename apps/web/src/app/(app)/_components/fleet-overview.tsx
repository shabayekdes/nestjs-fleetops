import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { LICENSE_STATUS_LABELS } from '@/lib/license-status';
import { buildHref } from '@/lib/search-params';
import { SERVICE_STATUS_LABELS } from '@/lib/service-status';
import { formatDateOnly } from '@/lib/format';
import type { FleetDashboard } from '@/lib/api/types';
import { getFleetDashboard } from '../_lib/dashboard-api';
import { sectionError } from './section-error';
import { StatCard, StatListCard } from './stat-card';

const SERVICE_ROWS = ['OVERDUE', 'DUE_SOON', 'UNKNOWN', 'OK'] as const;

/** Counts come from the API as is: nothing is recomputed in the web app. */
export async function FleetOverview() {
  let stats: FleetDashboard;
  try {
    stats = await getFleetDashboard();
  } catch (error) {
    return sectionError(error, 'Fleet statistics are unavailable');
  }

  const { vehicles, drivers, assignments } = stats;

  if (vehicles.total === 0 && drivers.total === 0) {
    return (
      <EmptyState
        title="Your fleet is empty"
        description="Add vehicles and drivers to see fleet statistics here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/vehicles/new">Add vehicle</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/drivers/new">Add driver</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <section aria-labelledby="fleet-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fleet-heading" className="text-lg font-medium">
          Fleet
        </h2>
        <p className="text-muted-foreground text-sm">
          as of {formatDateOnly(stats.asOf)}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Vehicles"
          value={vehicles.total}
          href="/vehicles"
          detail={`${assignments.active} assigned`}
        />
        <StatCard label="Drivers" value={drivers.total} href="/drivers" />
        <StatCard
          label="Active assignments"
          value={assignments.active}
          href={buildHref('/assignments', { active: 'true' })}
        />
        <StatListCard
          title="Service"
          items={SERVICE_ROWS.map((status) => ({
            label: SERVICE_STATUS_LABELS[status],
            value: vehicles.serviceStatus[status],
            href: buildHref('/vehicles', { serviceStatus: status }),
          }))}
        />
        <StatListCard
          title="Licenses"
          items={[
            {
              label: LICENSE_STATUS_LABELS.EXPIRED,
              value: drivers.licenseStatus.EXPIRED,
              href: buildHref('/drivers', { licenseStatus: 'EXPIRED' }),
            },
            {
              label: 'Expiring within 30 days',
              value: drivers.licenseStatus.EXPIRING_SOON,
              href: buildHref('/drivers', { licenseStatus: 'EXPIRING_SOON' }),
            },
          ]}
        />
      </div>
    </section>
  );
}
