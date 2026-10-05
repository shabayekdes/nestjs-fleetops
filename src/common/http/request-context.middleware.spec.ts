import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { requestContextMiddleware } from './request-context.middleware.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  const req = {
    headers: { ...headers },
    method: 'POST',
    originalUrl: '/api/v1/auth/login?password=hunter2',
    ip: '9.9.9.9',
    body: { password: 'hunter2' },
    ...extra,
  };
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {},
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  });
  const next = jest.fn();
  requestContextMiddleware(
    req as unknown as Request,
    res as unknown as Response,
    next,
  );
  return { req, res, next };
}

describe('requestContextMiddleware', () => {
  let logSpy: jest.SpiedFunction<Logger['log']>;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => logSpy.mockRestore());

  it('generates a UUID when the header is missing and calls next', () => {
    const { req, res, next } = setup();
    expect(req.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['X-Request-Id']).toBe(req.headers['x-request-id']);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid incoming id', () => {
    const { req, res } = setup({ 'x-request-id': 'abc.DEF_123-x' });
    expect(req.headers['x-request-id']).toBe('abc.DEF_123-x');
    expect(res.headers['X-Request-Id']).toBe('abc.DEF_123-x');
  });

  it('accepts a 64 character id', () => {
    const id = 'a'.repeat(64);
    expect(setup({ 'x-request-id': id }).req.headers['x-request-id']).toBe(id);
  });

  it.each([
    ['65 chars', 'a'.repeat(65)],
    ['spaces', 'abc def'],
    ['CRLF', 'abc\r\nSet-Cookie: x=1'],
    ['empty', ''],
  ])('replaces an invalid id (%s)', (_name, value) => {
    const { req, res } = setup({ 'x-request-id': value });
    expect(req.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['X-Request-Id']).toMatch(UUID);
  });

  it('logs exactly once on finish with the expected fields', () => {
    const { res } = setup({ 'x-request-id': 'rid-1' });
    expect(logSpy).not.toHaveBeenCalled();
    res.statusCode = 401;
    res.emit('finish');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith({
      msg: 'request completed',
      requestId: 'rid-1',
      method: 'POST',
      path: '/api/v1/auth/login',
      statusCode: 401,
      durationMs: expect.any(Number) as number,
      userId: undefined,
      organizationId: undefined,
      ip: '9.9.9.9',
    });
  });

  it('includes userId and organizationId when req.user is set', () => {
    const { req, res } = setup();
    (req as Record<string, unknown>).user = {
      userId: 'u1',
      organizationId: 'o1',
    };
    res.emit('finish');
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', organizationId: 'o1' }),
    );
  });

  it('never logs credentials, bodies or query strings', () => {
    const { res } = setup({ authorization: 'Bearer top.secret.token' });
    res.emit('finish');
    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toContain('top.secret.token');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('?');
  });
});
