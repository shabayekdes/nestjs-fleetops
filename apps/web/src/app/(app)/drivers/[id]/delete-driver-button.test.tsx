// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteDriver = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('../actions', () => ({ deleteDriver }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { DeleteDriverButton } from './delete-driver-button';

function setup() {
  render(
    <DeleteDriverButton id="d1" name="Sam Driver" licenseNumber="LIC-1" />,
  );
}

describe('DeleteDriverButton', () => {
  it('names the driver and shows an action error inside the dialog', async () => {
    deleteDriver.mockResolvedValue({
      error: 'Driver has assignments and cannot be deleted',
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this driver?');
    expect(dialog).toHaveTextContent('Sam Driver (license LIC-1)');
    expect(dialog).toHaveTextContent(
      'Drivers with assignment history cannot be deleted.',
    );
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Driver has assignments and cannot be deleted',
      ),
    );
    expect(deleteDriver).toHaveBeenCalledWith('d1');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
