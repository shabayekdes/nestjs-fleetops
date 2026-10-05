import 'server-only';
import { apiRequest } from './client';
import { ApiConnectionError, ApiError } from './errors';
import type { HealthResponse } from './types';

export type ApiHealthResult =
  | { state: 'ok'; health: HealthResponse; latencyMs: number }
  | { state: 'degraded'; health: HealthResponse | null; latencyMs: number }
  | { state: 'timeout' | 'unreachable'; message: string }
  | { state: 'error'; status: number; message: string };

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'ok' || v.status === 'error') &&
    typeof v.service === 'string' &&
    typeof v.timestamp === 'string' &&
    (v.database === 'up' || v.database === 'down')
  );
}

export async function getApiHealth(): Promise<ApiHealthResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  try {
    const health = await apiRequest<HealthResponse>('/health', {
      timeoutMs: 5_000,
    });
    return { state: 'ok', health, latencyMs: elapsed() };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 503) {
        return {
          state: 'degraded',
          health: isHealthResponse(error.body) ? error.body : null,
          latencyMs: elapsed(),
        };
      }
      return { state: 'error', status: error.status, message: error.message };
    }
    if (error instanceof ApiConnectionError) {
      return { state: error.reason, message: error.message };
    }
    throw error;
  }
}
