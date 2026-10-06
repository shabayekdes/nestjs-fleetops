// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteVehicle = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('../actions', () => ({ deleteVehicle }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { DeleteVehicleButton } from './delete-vehicle-button';

function setup() {
  render(
    <DeleteVehicleButton id="v1" make="Ford" model="Transit" vin="VIN17" />,
  );
}

describe('DeleteVehicleButton', () => {
  it('names the vehicle in the dialog and shows an action error inside it', async () => {
    deleteVehicle.mockResolvedValue({
      error: 'Vehicle has related records and cannot be deleted',
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this vehicle?');
    expect(dialog).toHaveTextContent('Ford Transit (VIN VIN17)');
    expect(dialog).toHaveTextContent('This cannot be undone.');

    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Vehicle has related records and cannot be deleted',
      ),
    );
    expect(deleteVehicle).toHaveBeenCalledWith('v1');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
