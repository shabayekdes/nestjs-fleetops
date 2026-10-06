// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

function setup(
  onConfirm: () => Promise<{ error?: string } | void>,
  variant?: 'default' | 'destructive',
) {
  render(
    <ConfirmDialog
      trigger={<button type="button">Delete</button>}
      title="Delete vehicle?"
      description="This cannot be undone."
      confirmLabel="Delete it"
      variant={variant}
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
}

describe('ConfirmDialog', () => {
  it('opens with title and description', () => {
    setup(vi.fn());
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Delete vehicle?',
    );
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('Cancel closes without confirming', () => {
    const onConfirm = vi.fn();
    setup(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Confirm calls onConfirm once, disables buttons while pending, then closes', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    setup(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));

    const working = await screen.findByRole('button', { name: 'Working…' });
    expect(working).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('ignores Escape while pending, then closes after resolving', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    setup(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await screen.findByRole('button', { name: 'Working…' });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('shows an error and stays open', async () => {
    setup(vi.fn(async () => ({ error: 'Vehicle is assigned' })));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vehicle is assigned',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete it' })).toBeEnabled(),
    );
  });

  it('uses destructive styling for the destructive variant', () => {
    setup(vi.fn(), 'destructive');
    expect(screen.getByRole('button', { name: 'Delete it' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
  });
});
