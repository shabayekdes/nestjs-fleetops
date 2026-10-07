import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';
import { DriverOverview } from './_components/driver-overview';
import { FleetCosts } from './_components/fleet-costs';
import { FleetOverview } from './_components/fleet-overview';
import { SectionSkeleton } from './_components/section-skeleton';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Role-specific home. Each section loads in its own Suspense boundary, so one
 * failing or slow section does not block the others. A DRIVER never reaches
 * the fleet sections, so the fleet endpoints are never called for them (the
 * API would answer 403 anyway; that is the real rule).
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  const isDriver = user.role === 'DRIVER';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome, ${user.firstName}.`}
      />
      <div className="space-y-8">
        {isDriver ? (
          <Suspense fallback={<SectionSkeleton label="your overview" />}>
            <DriverOverview />
          </Suspense>
        ) : (
          <>
            <Suspense fallback={<SectionSkeleton label="fleet statistics" />}>
              <FleetOverview />
            </Suspense>
            <Suspense fallback={<SectionSkeleton label="costs" />}>
              <FleetCosts />
            </Suspense>
          </>
        )}
      </div>
    </>
  );
}
