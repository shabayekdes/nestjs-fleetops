import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapPrismaError } from '../../database/prisma-errors.js';
import type {
  ErrorResponseDto,
  ValidationErrorDetailDto,
} from './error-response.dto.js';
import { REQUEST_ID_HEADER, stripQuery } from './request-context.middleware.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface Resolved {
  status: number;
  message: string;
  details?: ValidationErrorDetailDto[];
}

const isDetails = (value: unknown): value is ValidationErrorDetailDto[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.field === 'string' &&
      Array.isArray(item.messages),
  );

function fromHttpException(exception: HttpException): Resolved {
  const status = exception.getStatus();
  const body = exception.getResponse();
  const reason = STATUS_CODES[status] ?? 'Error';

  if (typeof body === 'string') {
    return { status, message: body || reason };
  }
  if (isRecord(body)) {
    if (status === 400 && isDetails(body.details)) {
      return { status, message: 'Validation failed', details: body.details };
    }
    const { message } = body;
    if (typeof message === 'string' && message) return { status, message };
    if (Array.isArray(message) && message.length > 0) {
      return { status, message: message.map(String).join('; ') };
    }
  }
  return { status, message: reason };
}

function fromUnknown(exception: unknown): Resolved {
  if (exception instanceof HttpException) return fromHttpException(exception);

  const prisma = mapPrismaError(exception);
  if (prisma) return fromHttpException(prisma);

  // body-parser style errors (for example 413) carry status and expose.
  if (
    isRecord(exception) &&
    typeof exception.status === 'number' &&
    exception.status >= 400 &&
    exception.status <= 499 &&
    exception.expose === true
  ) {
    return {
      status: exception.status,
      message: STATUS_CODES[exception.status] ?? 'Error',
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}

const logger = new Logger('ExceptionsHandler');

/** Writes the standard error body. Shared by the filter and the 404 fallback. */
export function sendErrorResponse(
  exception: unknown,
  req: Request,
  res: Response,
): void {
  const { status, message, details } = fromUnknown(exception);

  const header = req.headers?.[REQUEST_ID_HEADER];
  const requestId = typeof header === 'string' ? header : '';
  const path = stripQuery(req.originalUrl ?? req.url ?? '');

  if (status >= 500) {
    logger.error(
      { requestId, method: req.method, path, statusCode: status },
      exception instanceof Error ? exception.stack : String(exception),
    );
  }

  const body: ErrorResponseDto = {
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Error',
    message,
    requestId,
    timestamp: new Date().toISOString(),
    path,
    ...(details ? { details } : {}),
  };

  res.status(status).json(body);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendErrorResponse(
      exception,
      http.getRequest<Request>(),
      http.getResponse<Response>(),
    );
  }
}
