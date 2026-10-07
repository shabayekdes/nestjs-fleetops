'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { deleteFuelLog } from '../actions';

export function DeleteFuelButton({
  vehicleId,
  recordId,
  summary,
}: {
  vehicleId: string;
  recordId: string;
  /** Identifies the log to the user, e.g. "Fuel log of Jan 15, 2026". */
  summary: string;
}) {
  const expired = useSessionStatus().kind === 'expired';

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="destructive"
          size="sm"
          disabled={expired}
          aria-label={`Delete ${summary}`}
        >
          Delete
        </Button>
      }
      title="Delete this fuel log?"
      description={`${summary} will be deleted. This cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={() => deleteFuelLog(vehicleId, recordId)}
    />
  );
}
