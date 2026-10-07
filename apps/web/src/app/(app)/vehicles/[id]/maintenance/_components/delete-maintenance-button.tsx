'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { deleteMaintenanceRecord } from '../actions';

export function DeleteMaintenanceButton({
  vehicleId,
  recordId,
  summary,
}: {
  vehicleId: string;
  recordId: string;
  /** Identifies the record to the user, e.g. "Oil change on Jan 15, 2026". */
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
      title="Delete this maintenance record?"
      description={`${summary} will be deleted and the vehicle's service status may change. This cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={() => deleteMaintenanceRecord(vehicleId, recordId)}
    />
  );
}
