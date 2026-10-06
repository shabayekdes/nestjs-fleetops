import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export default function UserNotFound() {
  return (
    <EmptyState
      title="User not found"
      description="It may have been deleted, or it does not exist."
      action={
        <Button variant="outline" asChild>
          <Link href="/users">Back to users</Link>
        </Button>
      }
    />
  );
}
