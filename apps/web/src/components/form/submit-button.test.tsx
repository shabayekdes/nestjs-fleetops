// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ pending: false }));
const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string; href?: string },
}));
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  useFormStatus: () => ({ pending: status.pending }),
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { SubmitButton } from './submit-button';

function setup(pending: boolean, kind: string) {
  status.pending = pending;
  session.current = { kind, href: '/login' };
  render(<SubmitButton label="Save" pendingLabel="Saving…" />);
}

describe('SubmitButton', () => {
  it('is enabled by default', () => {
    setup(false, 'none');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows the pending label and disables while pending', () => {
    setup(true, 'none');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('stays enabled during the expiry warning', () => {
    setup(false, 'warning');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('is disabled and explained once the session has expired', () => {
    setup(false, 'expired');
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Your session has expired. Sign in again to save.',
    );
  });
});
