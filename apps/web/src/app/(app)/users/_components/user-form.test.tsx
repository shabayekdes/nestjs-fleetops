// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import type { UserFormState } from '../actions';
import { UserForm } from './user-form';

type Action = (p: UserFormState, f: FormData) => Promise<UserFormState>;

function setup(
  action: Action,
  props: {
    mode?: 'create' | 'edit';
    initialValues?: Record<string, string>;
    isSelf?: boolean;
  } = {},
) {
  render(
    <UserForm
      mode={props.mode ?? 'create'}
      action={action}
      initialValues={props.initialValues ?? {}}
      isSelf={props.isSelf}
      submitLabel="Create user"
      pendingLabel="Creating…"
      cancelHref="/users"
    />,
  );
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

const idle: Action = async () => ({ values: {} });

describe('UserForm', () => {
  it('sets the native constraints in create mode', () => {
    setup(idle);
    for (const label of [
      'First name',
      'Last name',
      'Email',
      'Password',
      'Role',
    ]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByLabelText('First name')).toHaveAttribute(
      'maxlength',
      '100',
    );
    expect(screen.getByLabelText('First name')).toHaveAttribute(
      'autocomplete',
      'given-name',
    );
    expect(screen.getByLabelText('Last name')).toHaveAttribute(
      'autocomplete',
      'family-name',
    );
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('maxlength', '254');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('minlength', '12');
    expect(password).toHaveAttribute('maxlength', '128');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAccessibleDescription('12 to 128 characters.');
  });

  it('starts the role on a placeholder in create mode', () => {
    setup(idle);
    const role = screen.getByLabelText('Role');
    expect(role).toHaveValue('');
    expect(role).toBeEnabled();
    expect(
      screen.getByRole('option', { name: 'Choose a role' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a role',
      'Admin',
      'Manager',
      'Driver',
    ]);
  });

  it('has no password field and no placeholder in edit mode', () => {
    setup(idle, {
      mode: 'edit',
      initialValues: { firstName: 'Ada', role: 'MANAGER' },
    });
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Choose a role' })).toBeNull();
    expect(screen.getByLabelText('Role')).toHaveValue('MANAGER');
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Role')).toBeEnabled();
  });

  it('disables the role and shows the hint for your own record', () => {
    setup(idle, {
      mode: 'edit',
      isSelf: true,
      initialValues: { role: 'ADMIN' },
    });
    const role = screen.getByLabelText('Role');
    expect(role).toBeDisabled();
    expect(role).toHaveAccessibleDescription(
      'You cannot change your own role.',
    );
  });

  it('links Cancel', () => {
    setup(idle);
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/users',
    );
  });

  it('shows field errors with aria wiring, keeps values and empties the password', async () => {
    const action = vi.fn(async (_p: UserFormState, f: FormData) => ({
      values: {
        firstName: String(f.get('firstName')),
        lastName: 'L',
        email: 'bad@x',
        role: 'DRIVER',
      },
      fieldErrors: { email: ['email must be an email'] },
    }));
    setup(action);
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Ada' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-password-1' },
    });
    submit();

    const email = await screen.findByLabelText('Email');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveAccessibleDescription(/email must be an email/);
    expect(email).toHaveValue('bad@x');
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Role')).toHaveValue('DRIVER');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Last name')).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('shows a form-level error as an alert', async () => {
    setup(async () => ({
      values: {},
      formError: 'A user with this email already exists',
    }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    );
  });

  it('shows the pending label while submitting', async () => {
    let resolve: (s: UserFormState) => void = () => {};
    setup(() => new Promise((r) => (resolve = r)));
    submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled(),
    );
    resolve({ values: {} });
    expect(
      await screen.findByRole('button', { name: 'Create user' }),
    ).toBeEnabled();
  });

  it('disables submit once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup(idle);
    expect(screen.getByRole('button', { name: 'Create user' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
