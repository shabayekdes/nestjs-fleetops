'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { deleteDriver } from '../actions';

export function DeleteDriverButton({
  id,
  name,
  licenseNumber,
}: {
  id: string;
  name: string;
  licenseNumber: string;
}) {
  const expired = useSessionStatus().kind === 'expired';

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" disabled={expired}>
          Delete
        </Button>
      }
      title="Delete this driver?"
      description={`${name} (license ${licenseNumber}) will be deleted. This cannot be undone. Drivers with assignment history cannot be deleted.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={() => deleteDriver(id)}
    />
  );
}
