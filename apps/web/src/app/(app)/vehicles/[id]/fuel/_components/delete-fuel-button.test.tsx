// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteFuelLog = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('../actions', () => ({ deleteFuelLog }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { DeleteFuelButton } from './delete-fuel-button';

function setup() {
  render(
    <DeleteFuelButton
      vehicleId="v1"
      recordId="r1"
      summary="Fuel log of Jan 15, 2026"
    />,
  );
}

describe('DeleteFuelButton', () => {
  it('names the log in the dialog and keeps an action error inside it', async () => {
    deleteFuelLog.mockResolvedValue({ error: 'Cannot delete this' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Delete Fuel log/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this fuel log?');
    expect(dialog).toHaveTextContent('Fuel log of Jan 15, 2026');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(dialog).toHaveTextContent('Cannot delete this'));
    expect(deleteFuelLog).toHaveBeenCalledWith('v1', 'r1');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(
      screen.getByRole('button', { name: /Delete Fuel log/ }),
    ).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
