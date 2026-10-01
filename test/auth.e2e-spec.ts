import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { EnvironmentVariables } from '../src/config/env.validation.js';
import { PrismaService } from '../src/database/prisma.service.js';

type Body = Record<string, unknown>;

const b64url = (o: object): string =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

function craftToken(
  payload: Record<string, unknown>,
  secret: string | null,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
  hmacAlg = 'sha256',
): string {
  const input = `${b64url(header)}.${b64url(payload)}`;
  const sig =
    secret === null
      ? ''
      : createHmac(hmacAlg, secret).update(input).digest('base64url');
  return `${input}.${sig}`;
}

const now = (): number => Math.floor(Date.now() / 1000);

const INVALID_CREDENTIALS = {
  statusCode: 401,
  message: 'Invalid credentials',
  error: 'Unauthorized',
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let secret: string;

  const suffix = randomUUID().slice(0, 8);
  const slugA = `auth-a-${suffix}`;
  const slugB = `auth-b-${suffix}`;
  const sharedEmail = `shared-${suffix}@example.test`;
  const delEmail = `del-${suffix}@example.test`;
  const passA = `Pass-A-${suffix}-xyz!`;
  const passB = `Pass-B-${suffix}-xyz!`;
  const passDel = `Pass-D-${suffix}-xyz!`;

  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send(body);

  const loginToken = async (
    organizationSlug: string,
    email: string,
    password: string,
  ): Promise<string> => {
    const res = await login({ organizationSlug, email, password }).expect(200);
    return (res.body as Body).accessToken as string;
  };

  const me = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return authorization === undefined
      ? req
      : req.set('Authorization', authorization);
  };

  const expectBare401 = (res: { status: number; body: unknown }) => {
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    secret = app
      .get<ConfigService<EnvironmentVariables, true>>(ConfigService)
      .get('JWT_SECRET', { infer: true });

    const orgA = await prisma.organization.create({
      data: { name: `Auth A ${suffix}`, slug: slugA },
    });
    orgIds.push(orgA.id);
    const orgB = await prisma.organization.create({
      data: { name: `Auth B ${suffix}`, slug: slugB },
    });
    orgIds.push(orgB.id);
    orgAId = orgA.id;
    orgBId = orgB.id;

    const mk = (organizationId: string, email: string, passwordHash: string) =>
      prisma.user.create({
        data: {
          organizationId,
          email,
          firstName: 'Test',
          lastName: 'User',
          passwordHash,
        },
      });
    const userA = await mk(orgAId, sharedEmail, await hash(passA));
    const userB = await mk(orgBId, sharedEmail, await hash(passB));
    await mk(orgAId, delEmail, await hash(passDel));
    userAId = userA.id;
    userBId = userB.id;
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgIds.length > 0) {
        await prisma.user.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with a bearer token for valid credentials', async () => {
      const res = await login({
        organizationSlug: slugA,
        email: sharedEmail,
        password: passA,
      }).expect(200);

      const body = res.body as Body;
      expect(body.tokenType).toBe('Bearer');
      expect(typeof body.expiresIn).toBe('number');
      const token = body.accessToken as string;
      expect(token.split('.')).toHaveLength(3);

      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as Record<string, number | string>;
      expect(payload.sub).toBe(userAId);
      expect(payload.org).toBe(orgAId);
      expect((payload.exp as number) - (payload.iat as number)).toBe(
        body.expiresIn,
      );
      expect(Object.keys(payload).sort()).toEqual(
        ['exp', 'iat', 'org', 'sub'].sort(),
      );
      expect(JSON.stringify(body)).not.toContain(sharedEmail);
      expect(body).not.toHaveProperty('passwordHash');
      expect(Object.keys(body).sort()).toEqual(
        ['accessToken', 'expiresIn', 'tokenType'].sort(),
      );
    });

    it('normalizes padded and uppercase slug and email', async () => {
      await login({
        organizationSlug: `  ${slugA.toUpperCase()} `,
        email: `  ${sharedEmail.toUpperCase()}  `,
        password: passA,
      }).expect(200);
    });

    it('resolves the same email to the user of the requested org', async () => {
      const token = await loginToken(slugB, sharedEmail, passB);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as Record<string, string>;
      expect(payload.sub).toBe(userBId);
      expect(payload.org).toBe(orgBId);
    });

    it.each<[string, () => Record<string, unknown>]>([
      [
        'wrong password',
        () => ({ organizationSlug: slugA, email: sharedEmail, password: 'no' }),
      ],
      [
        'unknown email',
        () => ({
          organizationSlug: slugA,
          email: `nobody-${suffix}@example.test`,
          password: passA,
        }),
      ],
      [
        'unknown slug',
        () => ({
          organizationSlug: `missing-${suffix}`,
          email: sharedEmail,
          password: passA,
        }),
      ],
      [
        'org B slug with org A password',
        () => ({
          organizationSlug: slugB,
          email: sharedEmail,
          password: passA,
        }),
      ],
      [
        'org A slug with org B password',
        () => ({
          organizationSlug: slugA,
          email: sharedEmail,
          password: passB,
        }),
      ],
      [
        '128-char wrong password',
        () => ({
          organizationSlug: slugA,
          email: sharedEmail,
          password: 'x'.repeat(128),
        }),
      ],
    ])('returns an identical 401 for %s', async (_name, body) => {
      const res = await login(body()).expect(401);
      expect(res.body).toEqual(INVALID_CREDENTIALS);
    });

    it('ignores a garbage Authorization header (public route)', async () => {
      await login({
        organizationSlug: slugA,
        email: sharedEmail,
        password: passA,
      })
        .set('Authorization', 'Bearer garbage')
        .expect(200);
    });

    const ok = {
      organizationSlug: 'acme',
      email: 'a@example.test',
      password: 'secret',
    };
    it.each<[string, Record<string, unknown>]>([
      ['empty body', {}],
      ['missing slug', { email: ok.email, password: ok.password }],
      [
        'missing email',
        { organizationSlug: ok.organizationSlug, password: ok.password },
      ],
      [
        'missing password',
        { organizationSlug: ok.organizationSlug, email: ok.email },
      ],
      ['bad email', { ...ok, email: 'not-an-email' }],
      ['129-char password', { ...ok, password: 'p'.repeat(129) }],
      ['empty password', { ...ok, password: '' }],
      ['extra field', { ...ok, role: 'admin' }],
      ['numeric slug', { ...ok, organizationSlug: 123 }],
      ['null email', { ...ok, email: null }],
    ])('returns 400 (never 500) for %s', async (_name, body) => {
      const res = await login(body);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the profile without passwordHash', async () => {
      const token = await loginToken(slugA, sharedEmail, passA);
      const res = await me(`Bearer ${token}`).expect(200);
      const body = res.body as Body;

      expect(Object.keys(body).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'id',
          'lastName',
          'organizationId',
          'updatedAt',
        ].sort(),
      );
      expect(body).not.toHaveProperty('passwordHash');
      expect(body.id).toBe(userAId);
      expect(body.organizationId).toBe(orgAId);
      expect(body.email).toBe(sharedEmail);
    });

    it('returns the org B user for an org B token', async () => {
      const token = await loginToken(slugB, sharedEmail, passB);
      const body = (await me(`Bearer ${token}`).expect(200)).body as Body;
      expect(body.id).toBe(userBId);
      expect(body.organizationId).toBe(orgBId);
    });

    it('accepts a lowercase scheme', async () => {
      const token = await loginToken(slugA, sharedEmail, passA);
      await me(`bearer ${token}`).expect(200);
    });

    describe('rejections', () => {
      const valid = (): Record<string, unknown> => ({
        sub: userAId,
        org: orgAId,
        iat: now(),
        exp: now() + 300,
      });

      it('rejects a missing header', async () => {
        expectBare401(await me());
      });

      it('rejects a garbage bearer token', async () => {
        expectBare401(await me('Bearer garbage'));
      });

      it('rejects the Basic scheme with a valid token', async () => {
        const token = craftToken(valid(), secret);
        expectBare401(await me(`Basic ${token}`));
      });

      it('rejects a token without a scheme', async () => {
        const token = craftToken(valid(), secret);
        expectBare401(await me(token));
      });

      it('sanity: a crafted valid token is accepted', async () => {
        const token = craftToken(valid(), secret);
        await me(`Bearer ${token}`).expect(200);
      });

      it('rejects a token signed with the wrong secret', async () => {
        const token = craftToken(valid(), 'w'.repeat(48));
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects an expired token', async () => {
        const token = craftToken(
          { sub: userAId, org: orgAId, iat: now() - 600, exp: now() - 300 },
          secret,
        );
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects alg:none without a signature', async () => {
        const token = craftToken(valid(), null, { alg: 'none', typ: 'JWT' });
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects alg:none carrying a real signature', async () => {
        const token = craftToken(valid(), secret, { alg: 'none', typ: 'JWT' });
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects HS512 even with the correct secret', async () => {
        const token = craftToken(
          valid(),
          secret,
          { alg: 'HS512', typ: 'JWT' },
          'sha512',
        );
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects a token missing the org claim', async () => {
        const rest = valid();
        delete rest.org;
        expectBare401(await me(`Bearer ${craftToken(rest, secret)}`));
      });

      it('rejects an empty sub', async () => {
        const token = craftToken({ ...valid(), sub: '' }, secret);
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects a tampered payload', async () => {
        const token = craftToken(valid(), secret);
        const [h, , s] = token.split('.');
        const forged = b64url({ ...valid(), sub: userBId, org: orgBId });
        expectBare401(await me(`Bearer ${h}.${forged}.${s}`));
      });

      it('rejects a signed token pairing user A with org B (tenant isolation)', async () => {
        const token = craftToken({ ...valid(), org: orgBId }, secret);
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects a token for a nonexistent user', async () => {
        const token = craftToken({ ...valid(), sub: randomUUID() }, secret);
        expectBare401(await me(`Bearer ${token}`));
      });

      it('rejects a token whose user was deleted', async () => {
        const token = await loginToken(slugA, delEmail, passDel);
        await me(`Bearer ${token}`).expect(200);

        await prisma.user.deleteMany({
          where: { organizationId: orgAId, email: delEmail },
        });

        expectBare401(await me(`Bearer ${token}`));
      });
    });
  });

  describe('public routes', () => {
    it.each(['/api/v1', '/api/v1/health'])(
      'GET %s works without a token',
      async (path) => {
        await request(app.getHttpServer()).get(path).expect(200);
      },
    );

    it.each(['/api/v1', '/api/v1/health'])(
      'GET %s ignores a garbage bearer token',
      async (path) => {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', 'Bearer garbage')
          .expect(200);
      },
    );

    it('keeps unversioned /health at 404', async () => {
      await request(app.getHttpServer()).get('/health').expect(404);
    });
  });
});
