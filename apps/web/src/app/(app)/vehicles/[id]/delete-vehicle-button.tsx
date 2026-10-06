'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { deleteVehicle } from '../actions';

export function DeleteVehicleButton({
  id,
  make,
  model,
  vin,
}: {
  id: string;
  make: string;
  model: string;
  vin: string;
}) {
  const expired = useSessionStatus().kind === 'expired';

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" disabled={expired}>
          Delete
        </Button>
      }
      title="Delete this vehicle?"
      description={`${make} ${model} (VIN ${vin}) will be deleted. This cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={() => deleteVehicle(id)}
    />
  );
}
