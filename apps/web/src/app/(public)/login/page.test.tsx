// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ login: vi.fn() }));

import LoginPage from './page';

async function renderPage(searchParams: Record<string, string>) {
  const props = {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  } as unknown as PageProps<'/login'>;
  render(await LoginPage(props));
}

describe('LoginPage', () => {
  it('shows the expired notice', async () => {
    await renderPage({ reason: 'expired' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your session has expired. Please sign in again.',
    );
  });

  it('shows the signed-out notice', async () => {
    await renderPage({ reason: 'signed-out' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'You have been signed out.',
    );
  });

  it('shows no notice for an unknown reason and sanitizes returnTo', async () => {
    await renderPage({ reason: 'whatever', returnTo: '//evil.example' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('input[name="returnTo"]')).toHaveAttribute(
      'value',
      '/',
    );
  });
});
