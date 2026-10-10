import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  createTestCatalog,
  type TestCatalog,
} from './utils/vehicle-catalog.js';
import { errorBody } from './utils/error-body.js';

type Body = Record<string, unknown>;
type Role = 'ADMIN' | 'MANAGER' | 'DRIVER';
type Actor = 'admin' | 'admin2' | 'manager' | 'driver' | 'adminB';
type Method = 'get' | 'post' | 'patch' | 'delete';

const BASE = '/api/v1/users';
const RESPONSE_KEYS = [
  'createdAt',
  'email',
  'firstName',
  'id',
  'lastName',
  'role',
  'updatedAt',
];
const NOT_FOUND = errorBody(404, 'User not found');
const FORBIDDEN = errorBody(403, 'Forbidden');
const UNAUTHORIZED = errorBody(401, 'Unauthorized');
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let catalog: TestCatalog;

  const suffix = randomUUID().slice(0, 8);
  const password = `Usr-${suffix}-passw0rd!`;
  const slugA = `usr-a-${suffix}`;
  const slugB = `usr-b-${suffix}`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;

  const ids = {} as Record<Actor, string>;
  const tokens = {} as Record<Actor, string>;

  const email = (tag: string): string =>
    `${tag}-${++seq}-${suffix}@example.test`;

  const login = async (
    organizationSlug: string,
    userEmail: string,
    pass = password,
  ): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ organizationSlug, email: userEmail, password: pass })
      .expect(200);
    return (res.body as Body).accessToken as string;
  };

  /** Direct DB insert (fast, independent of the API under test). */
  const mkUser = async (
    organizationId: string,
    role: Role,
    userEmail = email(role.toLowerCase()),
  ) => {
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: userEmail,
        firstName: 'Fixture',
        lastName: role,
        passwordHash: await hash(password),
        role,
      },
    });
    return user;
  };

  const api = (method: Method, path: string, actor: Actor | null = 'admin') => {
    const req = request(app.getHttpServer())[method](`${BASE}${path}`);
    return actor === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[actor]}`);
  };

  const payload = (o: Body = {}): Body => ({
    firstName: 'New',
    lastName: 'Person',
    email: email('new'),
    password: 'a-valid-password-123',
    role: 'DRIVER',
    ...o,
  });

  const createVia = async (o: Body = {}): Promise<Body> => {
    const res = await api('post', '').send(payload(o)).expect(201);
    return res.body as Body;
  };

  const dbUser = (id: string) => prisma.user.findUnique({ where: { id } });

  let missingId = '';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    catalog = await createTestCatalog(prisma, suffix);

    const orgA = await prisma.organization.create({
      data: { name: `Usr A ${suffix}`, slug: slugA },
    });
    orgIds.push(orgA.id);
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: `Usr B ${suffix}`, slug: slugB },
    });
    orgIds.push(orgB.id);
    orgBId = orgB.id;

    const specs: [Actor, string, Role, string][] = [
      ['admin', orgAId, 'ADMIN', slugA],
      ['admin2', orgAId, 'ADMIN', slugA],
      ['manager', orgAId, 'MANAGER', slugA],
      ['driver', orgAId, 'DRIVER', slugA],
      ['adminB', orgBId, 'ADMIN', slugB],
    ];
    for (const [actor, orgId, role, slug] of specs) {
      const user = await mkUser(orgId, role, email(actor.toLowerCase()));
      ids[actor] = user.id;
      tokens[actor] = await login(slug, user.email);
    }

    const tmp = await createVia();
    missingId = tmp.id as string;
    await api('delete', `/${missingId}`).expect(204);
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgIds.length > 0) {
        await prisma.vehicle.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.user.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
      await catalog.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('authentication (401)', () => {
    const someId = randomUUID();
    it.each<[Method, string]>([
      ['get', ''],
      ['post', ''],
      ['get', `/${someId}`],
      ['patch', `/${someId}`],
      ['delete', `/${someId}`],
    ])('%s %s without a token returns a bare 401', async (method, path) => {
      const res = await api(method, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it('POST with an invalid body and no token returns 401, not 400', async () => {
      await api('post', '', null).send({ nope: 1 }).expect(401);
    });

    it.each<Method>(['get', 'patch', 'delete'])(
      '%s with a malformed id and no token returns 401, not 400',
      async (method) => {
        await api(method, '/not-a-uuid', null).send({}).expect(401);
      },
    );

    it('PATCH /auth/me/password without a token returns 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/auth/me/password')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });
  });

  describe('authorization (403)', () => {
    const someId = randomUUID();
    const routes: [Method, string][] = [
      ['get', ''],
      ['post', ''],
      ['get', `/${someId}`],
      ['patch', `/${someId}`],
      ['delete', `/${someId}`],
    ];

    describe.each<Actor>(['manager', 'driver'])('as %s', (actor) => {
      it.each(routes)('%s %s returns 403', async (method, path) => {
        const res = await api(method, path, actor).send(
          method === 'post' ? payload() : {},
        );
        expect(res.status).toBe(403);
        expect(res.body).toEqual(FORBIDDEN);
      });
    });

    it('POST with an invalid body as DRIVER returns 403, not 400', async () => {
      await api('post', '', 'driver').send({ bad: true }).expect(403);
    });

    it('GET with a malformed id as MANAGER returns 403, not 400', async () => {
      await api('get', '/not-a-uuid', 'manager').expect(403);
    });

    it('does not create a user when a MANAGER tries to POST', async () => {
      const body = payload();
      await api('post', '', 'manager').send(body).expect(403);
      expect(
        await prisma.user.findFirst({
          where: { organizationId: orgAId, email: body.email as string },
        }),
      ).toBeNull();
    });

    it('does not modify or delete a user for a DRIVER', async () => {
      const target = await mkUser(orgAId, 'DRIVER');
      await api('patch', `/${target.id}`, 'driver')
        .send({ firstName: 'Hacked' })
        .expect(403);
      await api('delete', `/${target.id}`, 'driver').expect(403);
      const row = await dbUser(target.id);
      expect(row?.firstName).toBe('Fixture');
    });
  });

  describe('POST /users', () => {
    it('creates a user: 201, exactly 7 keys, role stored', async () => {
      const body = payload({ role: 'MANAGER', firstName: 'Casey' });
      const res = await api('post', '').send(body).expect(201);
      const out = res.body as Body;

      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
      expect(out.id).toMatch(UUID_V7_RE);
      expect(out.role).toBe('MANAGER');
      expect(out.firstName).toBe('Casey');
      expect(out).not.toHaveProperty('passwordHash');
      expect(out).not.toHaveProperty('organizationId');

      const row = await dbUser(out.id as string);
      expect(row?.role).toBe('MANAGER');
      expect(row?.organizationId).toBe(orgAId);
      expect(row?.passwordHash).not.toBe(body.password);
      expect(row?.passwordHash.startsWith('$argon2')).toBe(true);
    });

    it('normalizes email (trim + lowercase) and trims names', async () => {
      const raw = email('Mixed');
      const res = await api('post', '')
        .send(
          payload({
            email: `  ${raw.toUpperCase()}  `,
            firstName: '  Pat ',
            lastName: ' Lee  ',
          }),
        )
        .expect(201);
      const out = res.body as Body;
      expect(out.email).toBe(raw.toLowerCase());
      expect(out.firstName).toBe('Pat');
      expect(out.lastName).toBe('Lee');
    });

    it('lets the created user log in with the given password', async () => {
      const body = payload({ password: '  spaced password 99  ' });
      await api('post', '').send(body).expect(201);
      await login(slugA, body.email as string, '  spaced password 99  ');
    });

    it('creates the user in the caller org, ignoring cross-tenant attempts', async () => {
      const out = await createVia();
      expect((await dbUser(out.id as string))?.organizationId).toBe(orgAId);
      const asB = await api('post', '', 'adminB').send(payload()).expect(201);
      expect(
        (await dbUser((asB.body as Body).id as string))?.organizationId,
      ).toBe(orgBId);
    });

    it.each<[string, Body]>([
      ['short password', { password: 'a'.repeat(11) }],
      ['too long password', { password: 'a'.repeat(129) }],
      ['bad email', { email: 'not-an-email' }],
      ['invalid role', { role: 'SUPERUSER' }],
      ['lowercase role', { role: 'admin' }],
      ['empty firstName', { firstName: '   ' }],
      ['null lastName', { lastName: null }],
      ['extra organizationId', { organizationId: randomUUID() }],
      ['extra passwordHash', { passwordHash: 'x' }],
    ])('rejects %s with 400', async (_n, o) => {
      await api('post', '').send(payload(o)).expect(400);
    });

    it('rejects a missing role with 400 (no silent default)', async () => {
      const body = payload();
      delete body.role;
      const res = await api('post', '').send(body).expect(400);
      expect(JSON.stringify(res.body)).toContain('role');
      expect(
        await prisma.user.findFirst({
          where: { organizationId: orgAId, email: body.email as string },
        }),
      ).toBeNull();
    });

    it('rejects an empty body with 400', async () => {
      await api('post', '').send({}).expect(400);
    });

    describe('duplicates', () => {
      it('returns 409 for an existing email, also uppercase and padded', async () => {
        const existing = await createVia();
        for (const variant of [
          existing.email as string,
          (existing.email as string).toUpperCase(),
          `  ${existing.email as string}  `,
        ]) {
          const res = await api('post', '').send(payload({ email: variant }));
          expect(res.status).toBe(409);
          expect((res.body as Body).message).toBe(
            'A user with this email already exists',
          );
        }
      });

      it('allows the same email in a different org', async () => {
        const existing = await createVia();
        const res = await api('post', '', 'adminB').send(
          payload({ email: existing.email }),
        );
        expect(res.status).toBe(201);
      });
    });
  });

  describe('GET /users/:id', () => {
    it('returns the user with exactly 7 keys', async () => {
      const res = await api('get', `/${ids.manager}`).expect(200);
      const out = res.body as Body;
      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
      expect(out.id).toBe(ids.manager);
      expect(out.role).toBe('MANAGER');
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('get', `/${missingId}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each(['not-a-uuid', '123', randomUUID()])(
      'returns 400 for malformed or non-v7 id %s',
      async (id) => {
        const res = await api('get', `/${id}`);
        expect(res.status).toBe(400);
      },
    );
  });

  describe('GET /users (list)', () => {
    it('returns data and meta with defaults', async () => {
      const res = await api('get', '').expect(200);
      const body = res.body as { data: Body[]; meta: Body };
      const total = await prisma.user.count({
        where: { organizationId: orgAId },
      });
      expect(body.meta).toEqual({ page: 1, limit: 20, total });
      expect(body.data.length).toBe(Math.min(20, total));
      for (const row of body.data) {
        expect(Object.keys(row).sort()).toEqual(RESPONSE_KEYS);
      }
    });

    it('paginates without overlap, newest first', async () => {
      await createVia();
      await createVia();
      await createVia();
      const total = await prisma.user.count({
        where: { organizationId: orgAId },
      });
      const p1 = (await api('get', '?page=1&limit=2').expect(200)).body as {
        data: Body[];
        meta: Body;
      };
      const p2 = (await api('get', '?page=2&limit=2').expect(200)).body as {
        data: Body[];
        meta: Body;
      };
      expect(p1.meta).toEqual({ page: 1, limit: 2, total });
      expect(p2.meta).toEqual({ page: 2, limit: 2, total });
      const all = [...p1.data, ...p2.data].map((r) => r.id as string);
      expect(new Set(all).size).toBe(4);

      const expected = await prisma.user.findMany({
        where: { organizationId: orgAId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 4,
        select: { id: true },
      });
      expect(all).toEqual(expected.map((r) => r.id));
    });

    it('returns an empty data array past the last page', async () => {
      const res = await api('get', '?page=9999&limit=100').expect(200);
      expect((res.body as { data: Body[] }).data).toEqual([]);
    });

    it.each<Role>(['ADMIN', 'MANAGER', 'DRIVER'])(
      'filters by role=%s',
      async (role) => {
        const res = await api('get', `?role=${role}&limit=100`).expect(200);
        const body = res.body as { data: Body[]; meta: Body };
        const total = await prisma.user.count({
          where: { organizationId: orgAId, role },
        });
        expect(body.meta.total).toBe(total);
        expect(body.data.length).toBe(total);
        expect(body.data.every((r) => r.role === role)).toBe(true);
      },
    );

    it('never lists org B users', async () => {
      const res = await api('get', '?limit=100').expect(200);
      const listed = (res.body as { data: Body[] }).data.map((r) => r.id);
      expect(listed).not.toContain(ids.adminB);
      const rowsB = await prisma.user.findMany({
        where: { organizationId: orgBId },
        select: { id: true },
      });
      for (const r of rowsB) expect(listed).not.toContain(r.id);

      const resB = await api('get', '?limit=100', 'adminB').expect(200);
      const listedB = (resB.body as { data: Body[] }).data.map((r) => r.id);
      expect(listedB).toContain(ids.adminB);
      expect(listedB).not.toContain(ids.admin);
    });

    it.each([
      'limit=101',
      'limit=0',
      'page=0',
      'page=abc',
      'role=ROOT',
      'role=admin',
      'organizationId=' + randomUUID(),
      'organizationId=',
      'foo=bar',
    ])('returns 400 for ?%s', async (qs) => {
      await api('get', `?${qs}`).expect(400);
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates name, email (normalized) and role', async () => {
      const target = await mkUser(orgAId, 'DRIVER');
      const newEmail = email('patched');
      const res = await api('patch', `/${target.id}`)
        .send({
          firstName: ' Updated ',
          lastName: 'Name',
          email: newEmail.toUpperCase(),
          role: 'MANAGER',
        })
        .expect(200);
      const out = res.body as Body;
      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
      expect(out.firstName).toBe('Updated');
      expect(out.lastName).toBe('Name');
      expect(out.email).toBe(newEmail);
      expect(out.role).toBe('MANAGER');
      const row = await dbUser(target.id);
      expect(row?.role).toBe('MANAGER');
      expect(row?.passwordHash).toBe(target.passwordHash);
    });

    it('an empty body is a no-op returning 200', async () => {
      const target = await mkUser(orgAId, 'DRIVER');
      const res = await api('patch', `/${target.id}`).send({}).expect(200);
      expect((res.body as Body).email).toBe(target.email);
    });

    it('partial update leaves other fields unchanged', async () => {
      const target = await mkUser(orgAId, 'DRIVER');
      await api('patch', `/${target.id}`)
        .send({ firstName: 'Only' })
        .expect(200);
      const row = await dbUser(target.id);
      expect(row?.firstName).toBe('Only');
      expect(row?.lastName).toBe(target.lastName);
      expect(row?.email).toBe(target.email);
      expect(row?.role).toBe('DRIVER');
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('patch', `/${missingId}`).send({ firstName: 'x' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each<[string, Body]>([
      ['null firstName', { firstName: null }],
      ['null email', { email: null }],
      ['null role', { role: null }],
      ['invalid role', { role: 'ROOT' }],
      ['bad email', { email: 'nope' }],
      ['password field', { password: 'a-valid-password-123' }],
      ['passwordHash field', { passwordHash: 'x' }],
      ['organizationId field', { organizationId: randomUUID() }],
    ])('rejects %s with 400 and changes nothing', async (_n, body) => {
      const target = await mkUser(orgAId, 'DRIVER');
      await api('patch', `/${target.id}`).send(body).expect(400);
      const row = await dbUser(target.id);
      expect(row?.passwordHash).toBe(target.passwordHash);
      expect(row?.organizationId).toBe(orgAId);
      expect(row?.role).toBe('DRIVER');
    });

    it('rejects a malformed id with 400', async () => {
      await api('patch', '/not-a-uuid').send({}).expect(400);
    });

    it('returns 409 when the email belongs to another user in the org', async () => {
      const a = await mkUser(orgAId, 'DRIVER');
      const b = await mkUser(orgAId, 'DRIVER');
      const res = await api('patch', `/${b.id}`).send({
        email: a.email.toUpperCase(),
      });
      expect(res.status).toBe(409);
      expect((await dbUser(b.id))?.email).toBe(b.email);
    });

    it('allows setting the same email on itself', async () => {
      const a = await mkUser(orgAId, 'DRIVER');
      await api('patch', `/${a.id}`).send({ email: a.email }).expect(200);
    });

    it('allows an email that exists only in another org', async () => {
      const a = await mkUser(orgAId, 'DRIVER');
      const b = await mkUser(orgBId, 'DRIVER');
      await api('patch', `/${a.id}`).send({ email: b.email }).expect(200);
    });
  });

  describe('DELETE /users/:id', () => {
    it('deletes: 204 with empty body, then 404', async () => {
      const target = await mkUser(orgAId, 'DRIVER');
      const res = await api('delete', `/${target.id}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await dbUser(target.id)).toBeNull();

      const again = await api('delete', `/${target.id}`);
      expect(again.status).toBe(404);
      expect(again.body).toEqual(NOT_FOUND);
      await api('get', `/${target.id}`).expect(404);
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('delete', `/${missingId}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('returns 400 for a malformed id', async () => {
      await api('delete', '/not-a-uuid').expect(400);
    });
  });

  describe('cross-tenant isolation', () => {
    let target: { id: string; email: string; firstName: string };

    beforeAll(async () => {
      target = await mkUser(orgBId, 'DRIVER');
    });

    it('GET another org user returns the same 404 as a missing id', async () => {
      const res = await api('get', `/${target.id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('PATCH another org user returns 404 and leaves the row unchanged', async () => {
      const res = await api('patch', `/${target.id}`).send({
        firstName: 'Hijacked',
        role: 'ADMIN',
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      const row = await dbUser(target.id);
      expect(row?.firstName).toBe(target.firstName);
      expect(row?.role).toBe('DRIVER');
      expect(row?.organizationId).toBe(orgBId);
    });

    it('PATCH another org user with a colliding email is 404, not 409', async () => {
      const res = await api('patch', `/${target.id}`).send({
        email: (await dbUser(ids.admin))?.email,
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('DELETE another org user returns 404 and the row survives', async () => {
      const res = await api('delete', `/${target.id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(await dbUser(target.id)).not.toBeNull();
    });

    it('org B admin cannot see org A users', async () => {
      const res = await api('get', `/${ids.driver}`, 'adminB');
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });
  });

  describe('self-protection', () => {
    it('admin cannot delete themselves (409) and still exists', async () => {
      const res = await api('delete', `/${ids.admin}`);
      expect(res.status).toBe(409);
      expect((res.body as Body).message).toBe(
        'You cannot delete your own account',
      );
      expect(await dbUser(ids.admin)).not.toBeNull();
    });

    it('admin cannot change their own role to MANAGER (409)', async () => {
      const res = await api('patch', `/${ids.admin}`).send({ role: 'MANAGER' });
      expect(res.status).toBe(409);
      expect((res.body as Body).message).toBe(
        'You cannot change your own role',
      );
      expect((await dbUser(ids.admin))?.role).toBe('ADMIN');
    });

    it('admin can PATCH own role to the same value (200)', async () => {
      await api('patch', `/${ids.admin}`).send({ role: 'ADMIN' }).expect(200);
    });

    it('admin can change own firstName (200)', async () => {
      const res = await api('patch', `/${ids.admin}`)
        .send({ firstName: 'Renamed' })
        .expect(200);
      expect((res.body as Body).firstName).toBe('Renamed');
    });

    it('admin A can demote admin B (same org) and admin B keeps a valid account', async () => {
      const other = await mkUser(orgAId, 'ADMIN');
      const res = await api('patch', `/${other.id}`)
        .send({ role: 'MANAGER' })
        .expect(200);
      expect((res.body as Body).role).toBe('MANAGER');
    });

    it('a peer admin can edit another admin profile', async () => {
      const res = await api('patch', `/${ids.admin2}`, 'admin').send({
        firstName: 'Peer',
      });
      expect(res.status).toBe(200);
    });
  });

  describe('role and deletion changes apply to existing tokens', () => {
    const mkVehicle = (token: string) =>
      request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          makeId: catalog.makeA.id,
          modelId: catalog.modelA1.id,
          vehicleTypeId: catalog.type.id,
          year: 2024,
          vin: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17),
        });
    const vehicles = (token: string, method: 'get' | 'post' = 'get') =>
      method === 'get'
        ? request(app.getHttpServer())
            .get('/api/v1/vehicles')
            .set('Authorization', `Bearer ${token}`)
        : mkVehicle(token);

    it('demoting a MANAGER to DRIVER revokes write access on the old token', async () => {
      const user = await mkUser(orgAId, 'MANAGER');
      const token = await login(slugA, user.email);

      await vehicles(token, 'post').expect(201);

      await api('patch', `/${user.id}`).send({ role: 'DRIVER' }).expect(200);

      await vehicles(token, 'post').expect(403);
      await vehicles(token, 'get').expect(200);
    });

    it('promoting a DRIVER to ADMIN grants /users access on the old token', async () => {
      const user = await mkUser(orgAId, 'DRIVER');
      const token = await login(slugA, user.email);

      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await api('patch', `/${user.id}`).send({ role: 'ADMIN' }).expect(200);

      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('a deleted user token returns 401 on GET /vehicles', async () => {
      const user = await mkUser(orgAId, 'DRIVER');
      const token = await login(slugA, user.email);
      await vehicles(token, 'get').expect(200);

      await api('delete', `/${user.id}`).expect(204);

      const res = await vehicles(token, 'get');
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });
  });
});
