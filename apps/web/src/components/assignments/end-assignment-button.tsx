'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { endAssignment } from '@/lib/assignments/actions';

export function EndAssignmentButton({
  assignmentId,
  vehicleId,
  driverId,
  returnTo,
  driverName,
  vehicleName,
}: {
  assignmentId: string;
  vehicleId: string;
  driverId: string;
  returnTo: 'vehicle' | 'driver';
  driverName: string;
  vehicleName: string;
}) {
  const expired = useSessionStatus().kind === 'expired';

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" disabled={expired}>
          End assignment
        </Button>
      }
      title="End this assignment?"
      description={`${driverName} will no longer be assigned to ${vehicleName}. The assignment stays in the history.`}
      confirmLabel="End assignment"
      onConfirm={() =>
        endAssignment(assignmentId, vehicleId, driverId, returnTo)
      }
    />
  );
}
