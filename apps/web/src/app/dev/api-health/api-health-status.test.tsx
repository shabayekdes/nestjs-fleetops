// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApiHealthResult } from '@/lib/api/health';
import { ApiHealthStatus } from './api-health-status';

const health = {
  status: 'ok' as const,
  service: 'fleetops-api',
  timestamp: 't',
  database: 'up' as const,
};

function renderResult(result: ApiHealthResult) {
  render(<ApiHealthStatus result={result} apiBaseUrl="http://api.test" />);
}

describe('ApiHealthStatus', () => {
  it('renders the ok state', () => {
    renderResult({ state: 'ok', health, latencyMs: 12 });
    expect(screen.getByText('API is healthy')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('up')).toBeInTheDocument();
    expect(screen.getByText('http://api.test')).toBeInTheDocument();
  });

  it('renders the degraded state with the database down', () => {
    renderResult({
      state: 'degraded',
      health: { ...health, status: 'error', database: 'down' },
      latencyMs: 30,
    });
    expect(screen.getByText('API is degraded')).toBeInTheDocument();
    expect(screen.getByText('down')).toBeInTheDocument();
  });

  it('renders the degraded state without a health body', () => {
    renderResult({ state: 'degraded', health: null, latencyMs: 5 });
    expect(screen.getByText('API is degraded')).toBeInTheDocument();
    expect(screen.getByText('5 ms')).toBeInTheDocument();
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
  });

  it('renders timeout and unreachable messages', () => {
    renderResult({ state: 'timeout', message: 'did not respond' });
    expect(screen.getByText('API timed out')).toBeInTheDocument();
    expect(screen.getByText('did not respond')).toBeInTheDocument();
  });

  it('renders unreachable', () => {
    renderResult({
      state: 'unreachable',
      message: 'FleetOps API is unreachable',
    });
    expect(screen.getByText('API is unreachable')).toBeInTheDocument();
    expect(screen.getByText('FleetOps API is unreachable')).toBeInTheDocument();
  });

  it('renders the error state with the status', () => {
    renderResult({ state: 'error', status: 500, message: 'failed' });
    expect(screen.getByText('API returned an error')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
