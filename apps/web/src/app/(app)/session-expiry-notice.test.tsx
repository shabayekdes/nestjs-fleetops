// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionExpiryNotice } from './session-expiry-notice';

beforeEach(() => {
  vi.useFakeTimers();
  window.history.pushState({}, '', '/vehicles?page=2');
});
afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('SessionExpiryNotice', () => {
  it('shows nothing with more than 2 minutes left', () => {
    const { container } = render(<SessionExpiryNotice remainingMs={600_000} />);
    advance(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns at 2 minutes or less', () => {
    render(<SessionExpiryNotice remainingMs={600_000} />);
    advance(600_000 - 100_000);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your session expires in about 2 minutes.',
    );
  });

  it('warns immediately when already inside the window', () => {
    render(<SessionExpiryNotice remainingMs={50_000} />);
    advance(1);
    expect(screen.getByRole('status')).toHaveTextContent('about 1 minute.');
  });

  it('shows an alert with a login link at the deadline', () => {
    render(<SessionExpiryNotice remainingMs={60_000} />);
    advance(75_000);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has expired.',
    );
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login?reason=expired&returnTo=%2Fvehicles%3Fpage%3D2',
    );
  });

  it('resets when remounted with a new key', () => {
    const { rerender } = render(
      <SessionExpiryNotice key="a" remainingMs={10_000} />,
    );
    advance(20_000);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<SessionExpiryNotice key="b" remainingMs={600_000} />);
    advance(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
