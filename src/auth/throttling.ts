import { seconds, type ThrottlerModuleOptions } from '@nestjs/throttler';

export const THROTTLE_ERROR_MESSAGE =
  'Too many requests, please try again later';

interface ThrottleRequest {
  ip?: string;
  body?: unknown;
  user?: { userId?: string };
}

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/** Per user when authenticated, otherwise per IP + account on login. */
export function accountTracker(req: Record<string, unknown>): string {
  const request = req as ThrottleRequest;
  if (request.user?.userId) {
    return `user:${request.user.userId}`;
  }
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {};
  return `login:${request.ip ?? ''}:${normalize(body.organizationSlug)}:${normalize(body.email)}`;
}

export function ipTracker(req: Record<string, unknown>): string {
  return `ip:${(req as ThrottleRequest).ip ?? ''}`;
}

export function buildThrottlerOptions(params: {
  ttlSeconds: number;
  limit: number;
  ipLimit: number;
}): ThrottlerModuleOptions {
  return {
    errorMessage: THROTTLE_ERROR_MESSAGE,
    throttlers: [
      {
        name: 'default',
        ttl: seconds(params.ttlSeconds),
        limit: params.limit,
        getTracker: accountTracker,
      },
      {
        name: 'ip',
        ttl: seconds(params.ttlSeconds),
        limit: params.ipLimit,
        getTracker: ipTracker,
      },
    ],
  };
}
