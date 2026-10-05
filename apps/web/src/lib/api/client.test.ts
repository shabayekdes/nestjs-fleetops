import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, buildApiUrl } from './client';
import { ApiConnectionError, ApiError } from './errors';

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch');
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init);
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
});

describe('buildApiUrl', () => {
  it('builds the versioned URL with query params', () => {
    expect(buildApiUrl('/vehicles', { page: 2, make: 'VW' })).toBe(
      'http://api.test/api/v1/vehicles?page=2&make=VW',
    );
  });

  it('drops undefined query values', () => {
    expect(buildApiUrl('/vehicles', { page: undefined, make: 'VW' })).toBe(
      'http://api.test/api/v1/vehicles?make=VW',
    );
  });

  it('accepts a base URL with a trailing slash', () => {
    vi.stubEnv('API_BASE_URL', 'http://api.test/');
    expect(buildApiUrl('/health')).toBe('http://api.test/api/v1/health');
  });

  it('throws when the path has no leading slash', () => {
    expect(() => buildApiUrl('health')).toThrow(/must start with/);
  });
});

describe('apiRequest', () => {
  it('sends Accept and no-store for GET without Content-Type', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest('/health');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
    expect(init?.cache).toBe('no-store');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('sends a JSON body with Content-Type', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ id: 1 }));
    await apiRequest('/vehicles', { method: 'POST', body: { vin: 'X' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ vin: 'X' }));
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('returns parsed JSON on 200', async () => {
    mockFetch().mockResolvedValue(jsonResponse({ hello: 'world' }));
    await expect(apiRequest('/x')).resolves.toEqual({ hello: 'world' });
  });

  it('returns undefined on 204', async () => {
    mockFetch().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      apiRequest('/x', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('maps an API error body to ApiError', async () => {
    mockFetch().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 409,
          error: 'Conflict',
          message: 'VIN already exists',
          requestId: 'r1',
          timestamp: 't',
          path: '/api/v1/vehicles',
        },
        { status: 409, statusText: 'Conflict' },
      ),
    );
    const error = await apiRequest('/vehicles').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('VIN already exists');
    expect((error as ApiError).requestId).toBe('r1');
  });

  it('falls back to a generic ApiError for non-JSON error bodies', async () => {
    mockFetch().mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );
    const error = await apiRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(
      'API request failed with status 502',
    );
    expect((error as ApiError).requestId).toBeNull();
  });

  it('throws on invalid JSON in a 200 response', async () => {
    mockFetch().mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(apiRequest('/x')).rejects.toThrow(
      'Invalid JSON in API response: GET /x',
    );
  });

  it('throws ApiConnectionError(timeout) when the request times out', async () => {
    mockFetch().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const error = await apiRequest('/x', { timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiConnectionError);
    expect((error as ApiConnectionError).reason).toBe('timeout');
  });

  it('throws ApiConnectionError(unreachable) without leaking the base URL', async () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    mockFetch().mockRejectedValue(new TypeError('fetch failed', { cause }));
    const error = await apiRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiConnectionError);
    expect((error as ApiConnectionError).reason).toBe('unreachable');
    expect((error as ApiConnectionError).cause).toBeInstanceOf(TypeError);
    expect((error as ApiConnectionError).message).not.toContain('api.test');
  });

  it('rethrows the original error when the caller aborts', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('Aborted', 'AbortError');
    controller.abort(abortError);
    mockFetch().mockImplementation(async (_url, init) => {
      throw init?.signal?.reason;
    });
    await expect(apiRequest('/x', { signal: controller.signal })).rejects.toBe(
      abortError,
    );
  });

  it('fails on invalid env without calling fetch', async () => {
    vi.stubEnv('API_BASE_URL', 'nope');
    const fetchMock = mockFetch();
    await expect(apiRequest('/x')).rejects.toThrow(/API_BASE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
