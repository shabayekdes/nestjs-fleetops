import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export default function MaintenanceRecordNotFound() {
  return (
    <EmptyState
      title="Maintenance record not found"
      description="It may have been deleted, or it does not exist."
      action={
        <Button variant="outline" asChild>
          <Link href="/vehicles">Back to vehicles</Link>
        </Button>
      }
    />
  );
}
