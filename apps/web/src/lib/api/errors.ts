import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly error: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly requestId: string | null;
  readonly path: string | null;
  readonly body: unknown;

  constructor(init: {
    status: number;
    error: string;
    message: string;
    fieldErrors: Record<string, string[]>;
    requestId: string | null;
    path: string | null;
    body: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.error = init.error;
    this.fieldErrors = init.fieldErrors;
    this.requestId = init.requestId;
    this.path = init.path;
    this.body = init.body;
  }
}

export class ApiConnectionError extends Error {
  readonly reason: 'timeout' | 'unreachable';

  constructor(
    reason: 'timeout' | 'unreachable',
    options: { timeoutMs?: number; cause?: unknown } = {},
  ) {
    super(
      reason === 'timeout'
        ? `FleetOps API did not respond within ${options.timeoutMs ?? 0} ms`
        : 'FleetOps API is unreachable',
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ApiConnectionError';
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    Array.isArray(value.messages) &&
    value.messages.every((m) => typeof m === 'string')
  );
}

export function isErrorResponseBody(value: unknown): value is ApiErrorBody {
  if (!isRecord(value)) return false;
  return (
    typeof value.statusCode === 'number' &&
    typeof value.error === 'string' &&
    typeof value.message === 'string' &&
    typeof value.requestId === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.path === 'string' &&
    (value.details === undefined ||
      (Array.isArray(value.details) && value.details.every(isDetail)))
  );
}

export function toApiError(
  status: number,
  statusText: string,
  body: unknown,
): ApiError {
  if (!isErrorResponseBody(body)) {
    return new ApiError({
      status,
      error: statusText || 'Error',
      message: `API request failed with status ${status}`,
      fieldErrors: {},
      requestId: null,
      path: null,
      body,
    });
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const detail of body.details ?? []) {
    fieldErrors[detail.field] = [
      ...(fieldErrors[detail.field] ?? []),
      ...detail.messages,
    ];
  }

  return new ApiError({
    status,
    error: body.error,
    message: body.message,
    fieldErrors,
    requestId: body.requestId,
    path: body.path,
    body,
  });
}
