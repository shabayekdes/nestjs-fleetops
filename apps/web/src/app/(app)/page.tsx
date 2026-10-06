import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth/current-user';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome, ${user.firstName}.`}
      />
      <EmptyState
        title="Your fleet overview will appear here"
        description="Fleet statistics are added in a later release."
      />
    </>
  );
}
