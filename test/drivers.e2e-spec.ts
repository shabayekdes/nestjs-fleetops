import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

type Body = Record<string, unknown>;
type Actor = 'admin' | 'manager' | 'driver' | 'adminB';
type Method = 'get' | 'post' | 'patch' | 'delete';

const BASE = '/api/v1/drivers';
const RESPONSE_KEYS = [
  'createdAt',
  'firstName',
  'id',
  'lastName',
  'licenseExpiresOn',
  'licenseNumber',
  'updatedAt',
  'userId',
];
const NOT_FOUND = {
  statusCode: 404,
  message: 'Driver not found',
  error: 'Not Found',
};
const FORBIDDEN = { statusCode: 403, message: 'Forbidden' };
const UNAUTHORIZED = { statusCode: 401, message: 'Unauthorized' };
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';

describe('Drivers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Drv-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;

  const tokens = {} as Record<Actor, string>;
  const userIds = {} as Record<Actor, string>;

  const lic = (): string => `DRV${++seq}-${suffix.toUpperCase()}`;
  const payload = (o: Body = {}): Body => ({
    firstName: 'Dana',
    lastName: 'Driver',
    licenseNumber: lic(),
    licenseExpiresOn: '2031-06-30',
    ...o,
  });

  const api = (method: Method, path: string, actor: Actor | null = 'admin') => {
    const req = request(app.getHttpServer())[method](`${BASE}${path}`);
    return actor === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[actor]}`);
  };

  const createVia = async (actor: Actor, o: Body = {}): Promise<Body> =>
    (await api('post', '', actor).send(payload(o)).expect(201)).body as Body;

  const dbRow = (id: string) => prisma.driver.findUnique({ where: { id } });

  const createUser = async (
    organizationId: string,
    role: 'ADMIN' | 'MANAGER' | 'DRIVER',
    tag: string,
  ) => {
    const passwordHash = await hash(password);
    return prisma.user.create({
      data: {
        organizationId,
        email: `${tag.toLowerCase()}-${++seq}-${suffix}@example.test`,
        firstName: 'Test',
        lastName: tag,
        passwordHash,
        role,
      },
    });
  };

  const login = async (slug: string, email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ organizationSlug: slug, email, password })
      .expect(200);
    return (res.body as Body).accessToken as string;
  };

  const setupActor = async (
    actor: Actor,
    orgId: string,
    slug: string,
    role: 'ADMIN' | 'MANAGER' | 'DRIVER',
  ) => {
    const user = await createUser(orgId, role, actor);
    userIds[actor] = user.id;
    tokens[actor] = await login(slug, user.email);
  };

  let missingId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const slugA = `drv-a-${suffix}`;
    const slugB = `drv-b-${suffix}`;
    const orgA = await prisma.organization.create({
      data: { name: `Drv A ${suffix}`, slug: slugA },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Drv B ${suffix}`, slug: slugB },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgIds.push(orgAId, orgBId);

    await setupActor('admin', orgAId, slugA, 'ADMIN');
    await setupActor('manager', orgAId, slugA, 'MANAGER');
    await setupActor('driver', orgAId, slugA, 'DRIVER');
    await setupActor('adminB', orgBId, slugB, 'ADMIN');

    const tmp = await createVia('admin');
    missingId = tmp.id as string;
    await api('delete', `/${missingId}`).expect(204);
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgIds.length > 0) {
        const where = { organizationId: { in: orgIds } };
        await prisma.vehicleAssignment.deleteMany({ where });
        await prisma.driver.deleteMany({ where });
        await prisma.vehicle.deleteMany({ where });
        await prisma.user.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
    } finally {
      await app.close();
    }
  });

  describe('authentication and authorization', () => {
    const someId = randomUUID();
    const routes: [Method, string][] = [
      ['get', ''],
      ['post', ''],
      ['get', `/${someId}`],
      ['patch', `/${someId}`],
      ['delete', `/${someId}`],
    ];

    it.each(routes)('%s %s without a token returns 401', async (m, path) => {
      const res = await api(m, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it.each(routes)('%s %s as DRIVER returns 403', async (m, path) => {
      const res = await api(m, path, 'driver').send({ bad: true });
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('MANAGER can create, read, update and delete', async () => {
      const created = await createVia('manager');
      const id = created.id as string;
      await api('get', `/${id}`, 'manager').expect(200);
      await api('get', '', 'manager').expect(200);
      await api('patch', `/${id}`, 'manager')
        .send({ firstName: 'Mgr' })
        .expect(200);
      await api('delete', `/${id}`, 'manager').expect(204);
    });
  });

  describe('POST /drivers', () => {
    it('creates a driver with the exact 8-key shape and normalization', async () => {
      const license = ` dl-${suffix} 9 `;
      const res = await api('post', '')
        .send(
          payload({
            firstName: '  Dana ',
            licenseNumber: license,
            licenseExpiresOn: '2031-06-30',
          }),
        )
        .expect(201);
      const body = res.body as Body;
      expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
      expect(body.id).toMatch(UUID_V7_RE);
      expect(body.firstName).toBe('Dana');
      expect(body.licenseNumber).toBe(`DL-${suffix.toUpperCase()} 9`);
      expect(body.licenseExpiresOn).toBe('2031-06-30');
      expect(body.userId).toBeNull();
      expect(body).not.toHaveProperty('organizationId');
      const row = await dbRow(body.id as string);
      expect(row?.organizationId).toBe(orgAId);
    });

    it('accepts an already expired license', async () => {
      const body = await createVia('admin', { licenseExpiresOn: '2020-02-29' });
      expect(body.licenseExpiresOn).toBe('2020-02-29');
    });

    it('rejects a duplicate license in the same org with 409', async () => {
      const first = await createVia('admin');
      const res = await api('post', '')
        .send(payload({ licenseNumber: first.licenseNumber }))
        .expect(409);
      expect((res.body as Body).message).toBe(
        'A driver with this license number already exists',
      );
    });

    it('treats the license case-insensitively via normalization', async () => {
      const first = await createVia('admin');
      await api('post', '')
        .send(
          payload({
            licenseNumber: (first.licenseNumber as string).toLowerCase(),
          }),
        )
        .expect(409);
    });

    it('allows the same license in another org', async () => {
      const first = await createVia('admin');
      await api('post', '', 'adminB')
        .send(payload({ licenseNumber: first.licenseNumber }))
        .expect(201);
    });

    it('links a same-org user', async () => {
      const user = await createUser(orgAId, 'DRIVER', 'linkme');
      const body = await createVia('admin', { userId: user.id });
      expect(body.userId).toBe(user.id);
    });

    it('rejects linking an already-linked user with 409', async () => {
      const user = await createUser(orgAId, 'DRIVER', 'linked');
      await createVia('admin', { userId: user.id });
      const res = await api('post', '')
        .send(payload({ userId: user.id }))
        .expect(409);
      expect((res.body as Body).message).toBe(
        'This user is already linked to a driver',
      );
    });

    it('rejects an other-org user with 404 User not found and creates nothing', async () => {
      const lic2 = lic();
      const res = await api('post', '')
        .send(payload({ userId: userIds.adminB, licenseNumber: lic2 }))
        .expect(404);
      expect((res.body as Body).message).toBe('User not found');
      expect(
        await prisma.driver.findFirst({
          where: { organizationId: orgAId, licenseNumber: lic2 },
        }),
      ).toBeNull();
    });

    it('rejects a non-existent same-format user id with 404', async () => {
      const res = await api('post', '')
        .send(payload({ userId: missingId }))
        .expect(404);
      expect((res.body as Body).message).toBe('User not found');
    });

    it.each<[string, Body]>([
      ['empty body', {}],
      ['blank firstName', { firstName: '   ' }],
      ['bad license chars', { licenseNumber: 'AB_1' }],
      ['invalid date', { licenseExpiresOn: '2027-02-30' }],
      ['datetime', { licenseExpiresOn: '2027-02-01T00:00:00Z' }],
      ['bad userId', { userId: 'nope' }],
      ['unknown key', { extra: 1 }],
      ['organizationId', { organizationId: randomUUID() }],
    ])('returns 400 for %s', async (_n, override) => {
      const body = _n === 'empty body' ? {} : payload(override);
      const res = await api('post', '').send(body).expect(400);
      expect((res.body as Body).statusCode).toBe(400);
    });
  });

  describe('GET /drivers', () => {
    it('paginates with meta in newest-first order', async () => {
      const created: string[] = [];
      for (let i = 0; i < 3; i++) {
        created.push((await createVia('adminB')).id as string);
        await new Promise((r) => setTimeout(r, 5));
      }
      const res = await api('get', '?page=1&limit=2', 'adminB').expect(200);
      const body = res.body as {
        data: Body[];
        meta: { page: number; limit: number; total: number };
      };
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(2);
      expect(body.meta.total).toBeGreaterThanOrEqual(3);
      expect(body.data).toHaveLength(2);
      expect(Object.keys(body.data[0]).sort()).toEqual(RESPONSE_KEYS);
      expect(body.data.map((d) => d.id)).toEqual([created[2], created[1]]);
    });

    it('returns an empty page beyond the last page', async () => {
      const res = await api('get', '?page=9999').expect(200);
      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('only lists the caller organization', async () => {
      const inB = await createVia('adminB');
      const res = await api('get', '?limit=100').expect(200);
      const ids = (res.body as { data: Body[] }).data.map((d) => d.id);
      expect(ids).not.toContain(inB.id);
    });

    it.each(['page=0', 'limit=0', 'limit=101', 'page=abc', 'foo=1'])(
      'returns 400 for ?%s',
      async (qs) => {
        await api('get', `?${qs}`).expect(400);
      },
    );
  });

  describe('GET /drivers/:id', () => {
    it('returns the driver', async () => {
      const d = await createVia('admin');
      const res = await api('get', `/${d.id as string}`).expect(200);
      expect(res.body).toEqual(d);
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('get', `/${missingId}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('returns 400 for a malformed or non-v7 id', async () => {
      for (const id of ['abc', randomUUID()]) {
        const res = await api('get', `/${id}`).expect(400);
        expect((res.body as Body).message).toBe(BAD_UUID);
      }
    });

    it('returns the same 404 for another org driver', async () => {
      const d = await createVia('adminB');
      const res = await api('get', `/${d.id as string}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });
  });

  describe('PATCH /drivers/:id', () => {
    it('updates provided fields only', async () => {
      const d = await createVia('admin');
      const res = await api('patch', `/${d.id as string}`)
        .send({ lastName: 'Changed', licenseExpiresOn: '2040-01-02' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: d.id,
        firstName: d.firstName,
        lastName: 'Changed',
        licenseNumber: d.licenseNumber,
        licenseExpiresOn: '2040-01-02',
      });
    });

    it('accepts an empty body as a no-op', async () => {
      const d = await createVia('admin');
      const res = await api('patch', `/${d.id as string}`)
        .send({})
        .expect(200);
      expect((res.body as Body).lastName).toBe(d.lastName);
    });

    it('links then unlinks the user with null', async () => {
      const user = await createUser(orgAId, 'DRIVER', 'patchlink');
      const d = await createVia('admin');
      const linked = await api('patch', `/${d.id as string}`)
        .send({ userId: user.id })
        .expect(200);
      expect((linked.body as Body).userId).toBe(user.id);
      const unlinked = await api('patch', `/${d.id as string}`)
        .send({ userId: null })
        .expect(200);
      expect((unlinked.body as Body).userId).toBeNull();
      expect((await dbRow(d.id as string))?.userId).toBeNull();
    });

    it.each(['firstName', 'lastName', 'licenseNumber', 'licenseExpiresOn'])(
      'rejects null %s with 400',
      async (field) => {
        const d = await createVia('admin');
        await api('patch', `/${d.id as string}`)
          .send({ [field]: null })
          .expect(400);
      },
    );

    it('returns 409 when the license collides in the same org', async () => {
      const a = await createVia('admin');
      const b = await createVia('admin');
      const res = await api('patch', `/${b.id as string}`)
        .send({ licenseNumber: a.licenseNumber })
        .expect(409);
      expect((res.body as Body).message).toBe(
        'A driver with this license number already exists',
      );
    });

    it('returns 409 when the user is linked to another driver', async () => {
      const user = await createUser(orgAId, 'DRIVER', 'dup');
      await createVia('admin', { userId: user.id });
      const d = await createVia('admin');
      const res = await api('patch', `/${d.id as string}`)
        .send({ userId: user.id })
        .expect(409);
      expect((res.body as Body).message).toBe(
        'This user is already linked to a driver',
      );
    });

    it('returns 404 User not found for an other-org user', async () => {
      const d = await createVia('admin');
      const res = await api('patch', `/${d.id as string}`)
        .send({ userId: userIds.adminB })
        .expect(404);
      expect((res.body as Body).message).toBe('User not found');
    });

    it('returns 404 for a missing id and 400 for a bad id', async () => {
      const res = await api('patch', `/${missingId}`)
        .send({ firstName: 'X' })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      await api('patch', '/abc').send({}).expect(400);
    });

    it('returns 404 for another org driver (even on a colliding license) and leaves the row unchanged', async () => {
      const mine = await createVia('admin');
      const theirs = await createVia('adminB');
      const before = await dbRow(theirs.id as string);
      const res = await api('patch', `/${theirs.id as string}`)
        .send({ firstName: 'Hacked', licenseNumber: mine.licenseNumber })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(await dbRow(theirs.id as string)).toEqual(before);
    });
  });

  describe('DELETE /drivers/:id', () => {
    it('deletes an unassigned driver with 204 and an empty body', async () => {
      const d = await createVia('admin');
      const res = await api('delete', `/${d.id as string}`).expect(204);
      expect(res.text).toBe('');
      expect(await dbRow(d.id as string)).toBeNull();
      await api('get', `/${d.id as string}`).expect(404);
    });

    it('returns 404 when deleting twice', async () => {
      await api('delete', `/${missingId}`).expect(404);
    });

    it('returns 404 for another org driver and the row survives', async () => {
      const d = await createVia('adminB');
      const res = await api('delete', `/${d.id as string}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(await dbRow(d.id as string)).not.toBeNull();
    });

    it('returns 400 for a bad id', async () => {
      await api('delete', '/abc').expect(400);
    });

    it('returns 409 for a driver with assignment history and keeps the row', async () => {
      const d = await createVia('admin');
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: orgAId,
          make: 'Ford',
          model: 'Transit',
          year: 2022,
          vin: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17),
        },
      });
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: orgAId,
          vehicleId: vehicle.id,
          driverId: d.id as string,
          startedAt: new Date(Date.now() - 2000),
          endedAt: new Date(Date.now() - 1000),
        },
      });
      const res = await api('delete', `/${d.id as string}`).expect(409);
      expect((res.body as Body).message).toBe(
        'Driver has assignments and cannot be deleted',
      );
      expect(await dbRow(d.id as string)).not.toBeNull();
    });
  });

  describe('linked user deletion', () => {
    it('deleting the linked user succeeds and nulls driver.userId', async () => {
      const user = await createUser(orgAId, 'DRIVER', 'todelete');
      const d = await createVia('admin', { userId: user.id });
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(204);
      const row = await dbRow(d.id as string);
      expect(row).not.toBeNull();
      expect(row?.userId).toBeNull();
      const res = await api('get', `/${d.id as string}`).expect(200);
      expect((res.body as Body).userId).toBeNull();
    });
  });
});
