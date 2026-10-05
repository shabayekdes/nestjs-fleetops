import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { jest } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

type Body = Record<string, unknown>;

describe('Request logging (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  const suffix = randomUUID().slice(0, 8);
  const slug = `log-${suffix}`;
  const email = `log-${suffix}@example.test`;
  const password = `Pass-${suffix}-xyz!`;
  let orgId: string;

  const httpEntries = (): Record<string, unknown>[] =>
    logSpy.mock.calls
      .map(([entry]) => entry as Record<string, unknown>)
      .filter((entry) => entry?.msg === 'request completed');

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const org = await prisma.organization.create({
      data: { name: `Log ${suffix}`, slug },
    });
    orgId = org.id;
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        firstName: 'L',
        lastName: 'G',
        passwordHash: await hash(password),
      },
    });
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

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => logSpy.mockRestore());

  it('logs one HTTP entry per request without secrets', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login?probe=1')
      .send({ organizationSlug: slug, email, password })
      .expect(200);
    const token = (loginRes.body as Body).accessToken as string;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const entries = httpEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      msg: 'request completed',
      requestId: loginRes.headers['x-request-id'],
      method: 'POST',
      path: '/api/v1/auth/login',
      statusCode: 200,
    });
    expect(entries[1]).toMatchObject({
      requestId: meRes.headers['x-request-id'],
      method: 'GET',
      path: '/api/v1/auth/me',
      statusCode: 200,
      organizationId: orgId,
      userId: expect.any(String) as string,
    });

    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('probe');
  });

  it('logs failed requests with their status code', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    const entries = httpEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: res.headers['x-request-id'],
      statusCode: 404,
    });
  });
});
