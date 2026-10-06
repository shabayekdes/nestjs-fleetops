// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./_components/password-form', () => ({
  PasswordForm: () => <form aria-label="password form" />,
}));

import ChangePasswordPage from './page';

async function renderPage(notice?: string) {
  render(
    await ChangePasswordPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(notice ? { notice } : {}),
    }),
  );
}

describe('ChangePasswordPage', () => {
  it('renders the form for any role (it does not check the role)', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Change password' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('form', { name: 'password form' }),
    ).toBeInTheDocument();
  });

  it('shows the flash message', async () => {
    await renderPage('password-changed');
    expect(screen.getByRole('status')).toHaveTextContent('Password changed.');
  });

  it('ignores an unknown notice', async () => {
    await renderPage('nope');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
