import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface Captured {
  status?: number;
  body?: Record<string, unknown>;
}

function run(exception: unknown, req: Record<string, unknown> = {}): Captured {
  const captured: Captured = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  };
  const request = {
    method: 'GET',
    originalUrl: '/api/v1/things?secret=1',
    headers: { 'x-request-id': 'req-1' },
    ...req,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom secret', {
    code,
    clientVersion: 'test',
  });

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders NotFoundException in the standard shape', () => {
    const { status, body } = run(new NotFoundException('Vehicle not found'));
    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Vehicle not found',
      requestId: 'req-1',
      timestamp: expect.any(String) as string,
      path: '/api/v1/things',
    });
  });

  it('uses the reason phrase for a bare UnauthorizedException', () => {
    const { status, body } = run(new UnauthorizedException());
    expect(status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      message: 'Unauthorized',
    });
  });

  it('keeps validation details and sets message', () => {
    const details = [{ field: 'email', messages: ['email must be an email'] }];
    const { status, body } = run(
      new BadRequestException({ message: 'Validation failed', details }),
    );
    expect(status).toBe(400);
    expect(body?.message).toBe('Validation failed');
    expect(body?.details).toEqual(details);
  });

  it('does not add details to other responses', () => {
    const { body } = run(new NotFoundException('x'));
    expect(body).not.toHaveProperty('details');
  });

  it('joins array messages with "; "', () => {
    const { body } = run(new BadRequestException(['a bad', 'b bad']));
    expect(body?.message).toBe('a bad; b bad');
  });

  it('maps a 429 HttpException', () => {
    const { status, body } = run(
      new HttpException('Too many requests, please try again later', 429),
    );
    expect(status).toBe(429);
    expect(body).toMatchObject({
      error: 'Too Many Requests',
      message: 'Too many requests, please try again later',
    });
  });

  it.each([
    ['P2002', 409, 'Resource already exists'],
    ['P2003', 409, 'The request conflicts with related records'],
    ['P2025', 404, 'Resource not found'],
  ])('maps Prisma %s', (code, expectedStatus, message) => {
    const { status, body } = run(prismaError(code));
    expect(status).toBe(expectedStatus);
    expect(body?.message).toBe(message);
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('maps an unmapped Prisma code to 500', () => {
    const { status, body } = run(prismaError('P2010'));
    expect(status).toBe(500);
    expect(body?.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('hides the message of unexpected errors and logs the stack', () => {
    const error = new Error('db password=x');
    const { status, body } = run(error, { method: 'POST' });
    expect(status).toBe(500);
    expect(body?.message).toBe('Internal server error');
    expect(body?.error).toBe('Internal Server Error');
    expect(JSON.stringify(body)).not.toContain('password=x');
    expect(errorSpy).toHaveBeenCalledWith(
      {
        requestId: 'req-1',
        method: 'POST',
        path: '/api/v1/things',
        statusCode: 500,
      },
      error.stack,
    );
  });

  it('handles thrown non-Error values', () => {
    const { status, body } = run('oops');
    expect(status).toBe(500);
    expect(body?.message).toBe('Internal server error');
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), 'oops');
  });

  it('maps exposed 4xx non-HTTP errors (body-parser)', () => {
    const { status, body } = run({ status: 413, expose: true, message: 'x' });
    expect(status).toBe(413);
    expect(body?.message).toBe('Payload Too Large');
    expect(body?.error).toBe('Payload Too Large');
  });

  it('treats non-exposed status errors as 500', () => {
    expect(run({ status: 413, expose: false }).status).toBe(500);
    expect(run({ status: 500, expose: true }).status).toBe(500);
  });

  it('does not log 4xx at error level', () => {
    run(new NotFoundException());
    run(prismaError('P2002'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('strips the query string from path', () => {
    const { body } = run(new NotFoundException(), {
      originalUrl: '/api/v1/x?token=abc&y=1',
    });
    expect(body?.path).toBe('/api/v1/x');
  });

  it('returns an ISO timestamp', () => {
    const { body } = run(new NotFoundException());
    const ts = body?.timestamp as string;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('uses an empty requestId when the header is missing', () => {
    const { body } = run(new NotFoundException(), { headers: {} });
    expect(body?.requestId).toBe('');
  });
});
