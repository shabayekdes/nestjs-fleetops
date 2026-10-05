import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiHealth } from './health';
import { ApiConnectionError } from './errors';
import * as client from './client';

const healthy = {
  status: 'ok',
  service: 'fleetops-api',
  timestamp: '2026-01-01T00:00:00.000Z',
  database: 'up',
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init);
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
});

describe('getApiHealth', () => {
  it('returns ok for a 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(healthy));
    const result = await getApiHealth();
    expect(result.state).toBe('ok');
    expect(result).toMatchObject({ health: healthy });
  });

  it('returns degraded with the health body on a 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ ...healthy, status: 'error', database: 'down' }, { status: 503 }),
    );
    const result = await getApiHealth();
    expect(result.state).toBe('degraded');
    expect(result).toMatchObject({ health: { database: 'down' } });
  });

  it('returns degraded with null health for a non-health 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    );
    expect(await getApiHealth()).toMatchObject({
      state: 'degraded',
      health: null,
    });
  });

  it('returns unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed'),
    );
    expect(await getApiHealth()).toMatchObject({ state: 'unreachable' });
  });

  it('returns timeout', async () => {
    vi.spyOn(client, 'apiRequest').mockRejectedValue(
      new ApiConnectionError('timeout', { timeoutMs: 5000 }),
    );
    expect(await getApiHealth()).toMatchObject({ state: 'timeout' });
  });

  it('returns error with the status for other failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    expect(await getApiHealth()).toMatchObject({ state: 'error', status: 500 });
  });
});
