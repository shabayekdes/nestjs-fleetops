import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const httpLogger = new Logger('HTTP');

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

type RequestWithUser = Request & {
  user?: { userId?: string; organizationId?: string };
};

export function stripQuery(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}

/**
 * Assigns a request ID (X-Request-Id) and logs one line per completed request.
 * Never logs headers, bodies or query strings.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const user = (req as RequestWithUser).user;
    httpLogger.log({
      msg: 'request completed',
      requestId,
      method: req.method,
      path: stripQuery(req.originalUrl),
      statusCode: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      userId: user?.userId,
      organizationId: user?.organizationId,
      ip: req.ip,
    });
  });

  next();
}
