import { describe, expect, it } from 'vitest';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';
import { apiErrorToFormState } from './api-error-to-form';

const options = { fields: ['make', 'vin'] as const, notFoundMessage: 'Gone.' };

function apiError(
  status: number,
  message = 'API said so',
  fieldErrors: Record<string, string[]> = {},
) {
  return new ApiError({
    status,
    error: 'E',
    message,
    fieldErrors,
    requestId: 'r',
    path: '/p',
    body: undefined,
  });
}

describe('apiErrorToFormState', () => {
  it('maps a 400 to field errors for known fields only', () => {
    expect(
      apiErrorToFormState(
        apiError(400, 'Validation failed', {
          vin: ['bad vin'],
          other: ['ignored'],
        }),
        options,
      ),
    ).toEqual({ fieldErrors: { vin: ['bad vin'] } });
  });

  it('uses the message when a 400 has no known fields', () => {
    expect(
      apiErrorToFormState(
        apiError(400, 'Validation failed', { other: ['x'] }),
        options,
      ),
    ).toEqual({ formError: 'Validation failed' });
  });

  it('maps 403 to the not-allowed message', () => {
    expect(apiErrorToFormState(apiError(403), options)).toEqual({
      formError: 'You are not allowed to do this.',
    });
  });

  it('maps 404 to the supplied message', () => {
    expect(apiErrorToFormState(apiError(404), options)).toEqual({
      formError: 'Gone.',
    });
  });

  it('keeps the API message for 409 and other 4xx', () => {
    expect(
      apiErrorToFormState(apiError(409, 'Duplicate VIN'), options),
    ).toEqual({ formError: 'Duplicate VIN' });
    expect(apiErrorToFormState(apiError(422, 'Nope'), options)).toEqual({
      formError: 'Nope',
    });
  });

  it('maps 5xx and connection errors to the unavailable message', () => {
    const expected = {
      formError: 'The service is unavailable. Please try again shortly.',
    };
    expect(apiErrorToFormState(apiError(500, 'boom'), options)).toEqual(
      expected,
    );
    expect(
      apiErrorToFormState(new ApiConnectionError('unreachable'), options),
    ).toEqual(expected);
  });

  it('rethrows anything else, such as a redirect error', () => {
    const redirectLike = new Error('NEXT_REDIRECT');
    expect(() => apiErrorToFormState(redirectLike, options)).toThrow(
      redirectLike,
    );
    expect(() => apiErrorToFormState('x', options)).toThrow();
  });
});
