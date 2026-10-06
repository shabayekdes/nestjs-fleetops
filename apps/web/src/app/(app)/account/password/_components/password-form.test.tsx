// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const changePassword = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ changePassword }));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => ({ kind: 'none' }),
}));

import { PasswordForm } from './password-form';

beforeEach(() => {
  changePassword.mockReset();
  changePassword.mockResolvedValue({ values: {} });
});

function fill() {
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'old-password-1' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'new-password-12' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'new-password-12' },
  });
}

describe('PasswordForm', () => {
  it('sets the attributes and autocomplete values', () => {
    render(<PasswordForm />);
    const current = screen.getByLabelText('Current password');
    expect(current).toBeRequired();
    expect(current).toHaveAttribute('type', 'password');
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(current).toHaveAttribute('maxlength', '128');
    for (const label of ['New password', 'Confirm new password']) {
      const input = screen.getByLabelText(label);
      expect(input).toBeRequired();
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toHaveAttribute('autocomplete', 'new-password');
      expect(input).toHaveAttribute('minlength', '12');
      expect(input).toHaveAttribute('maxlength', '128');
    }
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      '12 to 128 characters. Must differ from your current password.',
    );
    expect(
      screen.getByRole('button', { name: 'Change password' }),
    ).toBeInTheDocument();
  });

  it('shows a form-level error and leaves every input empty', async () => {
    changePassword.mockResolvedValue({
      values: {},
      formError: 'Current password is incorrect',
    });
    render(<PasswordForm />);
    fill();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Current password is incorrect',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Current password')).toHaveValue(''),
    );
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
  });

  it('shows a field error with aria wiring', async () => {
    changePassword.mockResolvedValue({
      values: {},
      fieldErrors: { confirmPassword: ['Passwords do not match'] },
    });
    render(<PasswordForm />);
    fill();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    const confirm = await screen.findByLabelText('Confirm new password');
    await waitFor(() =>
      expect(confirm).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(confirm).toHaveAccessibleDescription('Passwords do not match');
  });
});
