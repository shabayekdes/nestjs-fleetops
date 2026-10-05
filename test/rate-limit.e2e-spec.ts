import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { buildThrottlerOptions } from '../src/auth/throttling.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { errorBody } from './utils/error-body.js';

type Body = Record<string, unknown>;

const LIMIT = 3;
const IP_LIMIT = 6;

async function createApp(): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(getOptionsToken())
    .useValue(
      buildThrottlerOptions({
        ttlSeconds: 60,
        limit: LIMIT,
        ipLimit: IP_LIMIT,
      }),
    )
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

describe('Rate limiting (e2e)', () => {
  const suffix = randomUUID().slice(0, 8);
  const slug = `rl-${suffix}`;
  const password = `Pass-${suffix}-xyz!`;
  const emailOf = (n: string) => `rl-${n}-${suffix}@example.test`;
  const orgIds: string[] = [];
  const apps: INestApplication<App>[] = [];
  let prisma: PrismaService;
  let orgId: string;

  const mkUser = async (name: string) =>
    prisma.user.create({
      data: {
        organizationId: orgId,
        email: emailOf(name),
        firstName: 'R',
        lastName: 'L',
        passwordHash: await hash(password),
      },
    });

  const login = (
    app: INestApplication<App>,
    name: string,
    pass = 'wrong-password',
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ organizationSlug: slug, email: emailOf(name), password: pass });

  const newApp = async () => {
    const app = await createApp();
    apps.push(app);
    return app;
  };

  beforeAll(async () => {
    const first = await newApp();
    prisma = first.get(PrismaService);
    const org = await prisma.organization.create({
      data: { name: `RL ${suffix}`, slug },
    });
    orgId = org.id;
    orgIds.push(org.id);
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'pw', 'pw2', 'me']) {
      await mkUser(n);
    }
  });

  afterAll(async () => {
    try {
      if (prisma && orgIds.length > 0) {
        await prisma.user.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
    } finally {
      for (const app of apps) await app.close();
    }
  });

  it('throttles an account after the limit, and correct credentials do not bypass it', async () => {
    const app = await newApp();
    for (let i = 0; i < LIMIT; i++) {
      await login(app, 'a').expect(401);
    }
    const res = await login(app, 'a');
    expect(res.status).toBe(429);
    expect(res.body).toEqual(
      errorBody(429, 'Too many requests, please try again later'),
    );
    expect(res.headers['retry-after']).toBeDefined();
    expect((res.body as Body).requestId).toBe(res.headers['x-request-id']);

    const correct = await login(app, 'a', password);
    expect(correct.status).toBe(429);
  });

  it('keys by account: another email from the same IP is unaffected until the IP limit', async () => {
    const app = await newApp();
    // 3 wrong attempts for "b" use 3 of 6 IP slots; the 4th is rejected by
    // the account throttler before the IP throttler counts it.
    for (let i = 0; i < LIMIT; i++) await login(app, 'b').expect(401);
    await login(app, 'b').expect(429);
    await login(app, 'c', password).expect(200); // 4
    await login(app, 'd', password).expect(200); // 5
    await login(app, 'e', password).expect(200); // 6
    const blocked = await login(app, 'f', password);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after-ip']).toBeDefined();
  });

  it('throttles password change per user and never throttles /auth/me', async () => {
    const app = await newApp();
    const token = ((await login(app, 'pw', password).expect(200)).body as Body)
      .accessToken as string;
    const change = (t?: string) => {
      const req = request(app.getHttpServer())
        .patch('/api/v1/auth/me/password')
        .send({
          currentPassword: 'wrong-current',
          newPassword: 'New-pass-12345!',
        });
      return t ? req.set('Authorization', `Bearer ${t}`) : req;
    };

    // Unauthenticated calls are rejected before the throttler and use no quota.
    for (let i = 0; i < 5; i++) {
      const res = await change();
      expect(res.status).toBe(401);
    }
    for (let i = 0; i < LIMIT; i++) {
      expect((await change(token)).status).not.toBe(429);
    }
    const res = await change(token);
    expect(res.status).toBe(429);
    expect(res.body).toEqual(
      errorBody(429, 'Too many requests, please try again later'),
    );

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });
});
