import { STATUS_CODES } from 'node:http';

/** Matcher for the standard error body produced by AllExceptionsFilter. */
export function errorBody(status: number, message: string) {
  return {
    statusCode: status,
    error: STATUS_CODES[status],
    message,
    requestId: expect.any(String) as string,
    timestamp: expect.any(String) as string,
    path: expect.any(String) as string,
  };
}

/** The request-independent part of an error body. */
export function stableError(body: unknown): {
  statusCode: unknown;
  error: unknown;
  message: unknown;
} {
  const { statusCode, error, message } = body as Record<string, unknown>;
  return { statusCode, error, message };
}
