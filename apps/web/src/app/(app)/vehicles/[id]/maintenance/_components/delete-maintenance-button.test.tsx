// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteMaintenanceRecord = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('../actions', () => ({ deleteMaintenanceRecord }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { DeleteMaintenanceButton } from './delete-maintenance-button';

function setup() {
  render(
    <DeleteMaintenanceButton
      vehicleId="v1"
      recordId="r1"
      summary="Oil change on Jan 15, 2026"
    />,
  );
}

describe('DeleteMaintenanceButton', () => {
  it('names the record in the dialog and keeps an action error inside it', async () => {
    deleteMaintenanceRecord.mockResolvedValue({ error: 'Cannot delete this' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Delete Oil change/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this maintenance record?');
    expect(dialog).toHaveTextContent('Oil change on Jan 15, 2026');
    expect(dialog).toHaveTextContent('This cannot be undone.');

    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(dialog).toHaveTextContent('Cannot delete this'));
    expect(deleteMaintenanceRecord).toHaveBeenCalledWith('v1', 'r1');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(
      screen.getByRole('button', { name: /Delete Oil change/ }),
    ).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
