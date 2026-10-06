// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteUser = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('../actions', () => ({ deleteUser }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { DeleteUserButton } from './delete-user-button';

function setup(isSelf = false) {
  render(
    <DeleteUserButton
      id="u1"
      name="Ada Lovelace"
      email="ada@example.test"
      isSelf={isSelf}
    />,
  );
}

describe('DeleteUserButton', () => {
  it('names the user in the dialog and shows an action error inside it', async () => {
    deleteUser.mockResolvedValue({
      error: 'You cannot delete your own account',
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this user?');
    expect(dialog).toHaveTextContent('Ada Lovelace (ada@example.test)');
    expect(dialog).toHaveTextContent('can no longer sign in');
    expect(dialog).toHaveTextContent('kept but unlinked');

    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() =>
      expect(dialog).toHaveTextContent('You cannot delete your own account'),
    );
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('is disabled with a linked hint for your own account', () => {
    setup(true);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'You cannot delete your own account.',
    );
  });

  it('is enabled and has no hint for another user', () => {
    setup(false);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(
      screen.queryByText('You cannot delete your own account.'),
    ).toBeNull();
  });

  it('disables the trigger once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
