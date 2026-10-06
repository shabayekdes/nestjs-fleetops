// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDeadlineProvider, useSessionStatus } from './session-deadline';

beforeEach(() => {
  vi.useFakeTimers();
  window.history.pushState({}, '', '/vehicles?page=2');
});
afterEach(() => {
  vi.useRealTimers();
});

function Probe() {
  const status = useSessionStatus();
  return <p data-testid="status">{JSON.stringify(status)}</p>;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function status() {
  return JSON.parse(screen.getByTestId('status').textContent ?? '');
}

describe('SessionDeadlineProvider', () => {
  it('goes none, warning, expired', () => {
    render(
      <SessionDeadlineProvider remainingMs={300_000}>
        <Probe />
      </SessionDeadlineProvider>,
    );
    advance(1);
    expect(status()).toEqual({ kind: 'none' });

    advance(200_000);
    expect(status()).toEqual({ kind: 'warning', minutes: 2 });

    advance(100_000);
    expect(status()).toEqual({
      kind: 'expired',
      href: '/login?reason=expired&returnTo=%2Fvehicles%3Fpage%3D2',
    });
  });

  it('returns none without a provider', () => {
    render(<Probe />);
    expect(status()).toEqual({ kind: 'none' });
  });
});
