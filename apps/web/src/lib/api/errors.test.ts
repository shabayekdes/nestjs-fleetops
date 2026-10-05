import { describe, expect, it } from 'vitest';
import {
  ApiConnectionError,
  ApiError,
  isErrorResponseBody,
  toApiError,
} from './errors';

const base = {
  requestId: 'req-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  path: '/api/v1/things',
};

describe('toApiError', () => {
  it('maps a validation body to field errors', () => {
    const error = toApiError(400, 'Bad Request', {
      ...base,
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: [
        { field: 'email', messages: ['email must be an email'] },
        { field: 'items.0.name', messages: ['name should not be empty'] },
      ],
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    expect(error.requestId).toBe('req-1');
    expect(error.path).toBe('/api/v1/things');
    expect(error.fieldErrors).toEqual({
      email: ['email must be an email'],
      'items.0.name': ['name should not be empty'],
    });
  });

  it('concatenates repeated fields', () => {
    const error = toApiError(400, 'Bad Request', {
      ...base,
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: [
        { field: 'email', messages: ['a'] },
        { field: 'email', messages: ['b'] },
      ],
    });
    expect(error.fieldErrors).toEqual({ email: ['a', 'b'] });
  });

  it.each([
    [404, 'Not Found', 'Vehicle not found'],
    [409, 'Conflict', 'VIN already exists'],
    [500, 'Internal Server Error', 'Internal server error'],
  ])('passes message and error through for %i', (status, name, message) => {
    const error = toApiError(status, name, {
      ...base,
      statusCode: status,
      error: name,
      message,
    });
    expect(error.message).toBe(message);
    expect(error.error).toBe(name);
    expect(error.fieldErrors).toEqual({});
  });

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['an empty object', {}],
    ['a non-string message', { message: 1 }],
    [
      'malformed details',
      {
        ...base,
        statusCode: 400,
        error: 'Bad Request',
        message: 'x',
        details: [{ field: 1, messages: 'no' }],
      },
    ],
  ])('falls back for %s', (_label, body) => {
    const error = toApiError(502, 'Bad Gateway', body);
    expect(error.status).toBe(502);
    expect(error.message).toBe('API request failed with status 502');
    expect(error.error).toBe('Bad Gateway');
    expect(error.requestId).toBeNull();
    expect(error.fieldErrors).toEqual({});
  });

  it('uses "Error" when there is no status text', () => {
    expect(toApiError(500, '', null).error).toBe('Error');
  });
});

describe('isErrorResponseBody', () => {
  it('rejects arrays', () => {
    expect(isErrorResponseBody([])).toBe(false);
  });
});

describe('ApiConnectionError', () => {
  it('describes timeouts and unreachable APIs without a URL', () => {
    const timeout = new ApiConnectionError('timeout', { timeoutMs: 50 });
    expect(timeout.message).toBe('FleetOps API did not respond within 50 ms');
    expect(timeout.name).toBe('ApiConnectionError');
    const cause = new Error('boom');
    const unreachable = new ApiConnectionError('unreachable', { cause });
    expect(unreachable.message).toBe('FleetOps API is unreachable');
    expect(unreachable.cause).toBe(cause);
  });
});
