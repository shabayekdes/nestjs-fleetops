import 'server-only';
import { getServerEnv } from '@/lib/env/server';
import { ApiConnectionError, toApiError } from './errors';

const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

type QueryValue = string | number | boolean | undefined;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Sent as `Authorization: Bearer <token>`. Server-side use only. */
  accessToken?: string;
};

export function buildApiUrl(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }
  const url = new URL(`${getServerEnv().API_BASE_URL}${API_PREFIX}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

export async function apiRequest<T>(
  path: `/${string}`,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildApiUrl(path, options.query);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const signals = [AbortSignal.timeout(timeoutMs)];
  if (options.signal) signals.push(options.signal);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.any(signals),
    });
    text = await response.text();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (isTimeoutError(error)) {
      throw new ApiConnectionError('timeout', { timeoutMs, cause: error });
    }
    if (error instanceof TypeError) {
      throw new ApiConnectionError('unreachable', { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    throw toApiError(response.status, response.statusText, parsed);
  }

  if (response.status === 204 || text === '') return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON in API response: ${method} ${path}`);
  }
}
