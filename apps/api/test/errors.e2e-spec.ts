import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Public } from '../src/auth/public.decorator.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { errorBody } from './utils/error-body.js';

type Body = Record<string, unknown>;

@Controller('test-errors')
class TestErrorsController {
  @Public()
  @Get('plain')
  plain(): never {
    throw new Error('secret db password=hunter2');
  }

  @Public()
  @Get('p2003')
  p2003(): never {
    throw new Prisma.PrismaClientKnownRequestError('fk secret', {
      code: 'P2003',
      clientVersion: 'test',
    });
  }

  @Public()
  @Get('p2025')
  p2025(): never {
    throw new Prisma.PrismaClientKnownRequestError('missing secret', {
      code: 'P2025',
      clientVersion: 'test',
    });
  }
}

describe('Error format (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const slug = `err-${suffix}`;
  const password = `Pass-${suffix}-xyz!`;
  let orgId: string;
  let driverToken: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorsController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({
      data: { name: `Err ${suffix}`, slug },
    });
    orgId = org.id;
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email: `driver-${suffix}@example.test`,
        firstName: 'D',
        lastName: 'R',
        role: 'DRIVER',
        passwordHash: await hash(password),
      },
    });
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({
        organizationSlug: slug,
        email: `driver-${suffix}@example.test`,
        password,
      })
      .expect(200);
    driverToken = (res.body as Body).accessToken as string;
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgId) {
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
    } finally {
      await app.close();
    }
  });

  it('unknown route returns the 404 shape with the path', async () => {
    const res = await request(server()).get('/api/v1/nope?x=1');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, 'Cannot GET /api/v1/nope?x=1'));
    expect((res.body as Body).path).toBe('/api/v1/nope');
  });

  it('unprefixed /health is a 404 in the shape', async () => {
    const res = await request(server()).get('/health');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, 'Cannot GET /health'));
  });

  it('POST to an unprefixed unknown path is a 404 in the shape', async () => {
    const res = await request(server()).post('/nothing').send({ a: 1 });
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual(errorBody(404, 'Cannot POST /nothing'));
  });

  it('body.requestId equals the X-Request-Id header', async () => {
    const res = await request(server()).get('/api/v1/nope');
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes a valid incoming request id', async () => {
    const res = await request(server())
      .get('/api/v1/nope')
      .set('X-Request-Id', 'client-id.123');
    expect(res.headers['x-request-id']).toBe('client-id.123');
    expect((res.body as Body).requestId).toBe('client-id.123');
  });

  it('replaces an invalid incoming request id', async () => {
    const res = await request(server())
      .get('/api/v1/nope')
      .set('X-Request-Id', 'has spaces in it');
    expect(res.headers['x-request-id']).not.toBe('has spaces in it');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);
  });

  it('validation failure returns 400 with details', async () => {
    const res = await request(server()).post('/api/v1/auth/login').send({
      organizationSlug: slug,
      email: 'not-an-email',
      password: 'x',
      role: 'ADMIN',
    });
    expect(res.status).toBe(400);
    const body = res.body as Body;
    expect(body).toMatchObject(errorBody(400, 'Validation failed'));
    const fields = (
      body.details as { field: string; messages: string[] }[]
    ).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'role']));
    for (const d of body.details as { messages: string[] }[]) {
      expect(Array.isArray(d.messages)).toBe(true);
    }
  });

  it('malformed JSON returns a 400 in the shape', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody(400, expect.any(String) as string));
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);
  });

  it('oversized body returns 413 before auth', async () => {
    const res = await request(server())
      .post('/api/v1/vehicles')
      .send({ pad: 'x'.repeat(150 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual(errorBody(413, 'Payload Too Large'));
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);
  });

  it('unexpected errors return 500 without leaking the message', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const res = await request(server()).get('/api/v1/test-errors/plain');
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    expect(res.body).toEqual(errorBody(500, 'Internal server error'));
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('unhandled Prisma P2003 returns 409', async () => {
    const res = await request(server()).get('/api/v1/test-errors/p2003');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(
      errorBody(409, 'The request conflicts with related records'),
    );
  });

  it('unhandled Prisma P2025 returns 404', async () => {
    const res = await request(server()).get('/api/v1/test-errors/p2025');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, 'Resource not found'));
  });

  it('missing token returns the 401 shape', async () => {
    const res = await request(server()).get('/api/v1/vehicles');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, 'Unauthorized'));
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);
  });

  it('DRIVER on an admin route returns the 403 shape', async () => {
    const res = await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      requestId: expect.any(String) as string,
      timestamp: expect.any(String) as string,
      path: '/api/v1/users',
    });
  });
});
