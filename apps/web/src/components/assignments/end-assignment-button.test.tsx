// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const endAssignment = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/lib/assignments/actions', () => ({ endAssignment }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { EndAssignmentButton } from './end-assignment-button';

function setup() {
  render(
    <EndAssignmentButton
      assignmentId="a1"
      vehicleId="v1"
      driverId="d1"
      returnTo="driver"
      driverName="Sam Driver"
      vehicleName="Ford Transit"
    />,
  );
}

describe('EndAssignmentButton', () => {
  it('describes the assignment and shows an action error inside the dialog', async () => {
    endAssignment.mockResolvedValue({ error: 'Assignment has already ended' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'End assignment' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('End this assignment?');
    expect(dialog).toHaveTextContent(
      'Sam Driver will no longer be assigned to Ford Transit. The assignment stays in the history.',
    );
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'End assignment',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() =>
      expect(dialog).toHaveTextContent('Assignment has already ended'),
    );
    expect(endAssignment).toHaveBeenCalledWith('a1', 'v1', 'd1', 'driver');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(
      screen.getByRole('button', { name: 'End assignment' }),
    ).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
