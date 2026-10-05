// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';
import type { LoginState } from './login-schema';

const noop = async (prev: LoginState) => prev;

describe('LoginForm', () => {
  it('renders labelled fields with the right attributes', () => {
    render(<LoginForm action={noop} returnTo="/vehicles" />);
    const org = screen.getByLabelText('Organization');
    expect(org).toBeRequired();
    expect(org).toHaveAttribute('maxlength', '100');
    expect(org).toHaveAttribute('autocomplete', 'organization');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toHaveAttribute('maxlength', '254');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('maxlength', '128');
    expect(document.querySelector('input[name="returnTo"]')).toHaveAttribute(
      'value',
      '/vehicles',
    );
  });

  it('shows the notice as a status', () => {
    render(<LoginForm action={noop} returnTo="/" notice="Signed out." />);
    expect(screen.getByRole('status')).toHaveTextContent('Signed out.');
  });

  it('shows field errors and a form error from the action', async () => {
    const action = vi.fn(async (): Promise<LoginState> => ({
      values: { organizationSlug: 'acme', email: 'x@y.test' },
      fieldErrors: { email: ['Enter a valid email address'] },
      formError: 'Invalid credentials',
    }));
    const { container } = render(<LoginForm action={action} returnTo="/" />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid credentials',
    );
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByText('Enter a valid email address')).toHaveAttribute(
      'id',
      'email-error',
    );
    expect(email).toHaveValue('x@y.test');
  });

  it('disables the button while pending', async () => {
    const action = vi.fn(() => new Promise<LoginState>(() => undefined));
    const { container } = render(<LoginForm action={action} returnTo="/" />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
  });
});
