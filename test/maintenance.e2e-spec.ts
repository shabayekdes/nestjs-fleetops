import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ServiceStatusJob } from '../src/maintenance/service-status.job.js';

type Body = Record<string, unknown>;
type Actor = 'admin' | 'manager' | 'driver' | 'adminB';
type Method = 'get' | 'post' | 'patch' | 'delete';

const RESPONSE_KEYS = [
  'cost',
  'createdAt',
  'description',
  'id',
  'nextServiceDueOn',
  'odometerKm',
  'performedOn',
  'type',
  'updatedAt',
  'vehicleId',
  'vendor',
];
const FORBIDDEN = { statusCode: 403, message: 'Forbidden' };
const UNAUTHORIZED = { statusCode: 401, message: 'Unauthorized' };
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';
const NO_VEHICLE = 'Vehicle not found';
const NO_RECORD = 'Maintenance record not found';
const DUE_MSG = 'nextServiceDueOn must be after performedOn';

// "Today" is computed once; offsets keep dates far from window boundaries.
const TODAY = new Date();
const day = (offset: number): string =>
  new Date(
    Date.UTC(
      TODAY.getUTCFullYear(),
      TODAY.getUTCMonth(),
      TODAY.getUTCDate() + offset,
    ),
  )
    .toISOString()
    .slice(0, 10);

describe('Maintenance records (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Mnt-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;
  const tokens = {} as Record<Actor, string>;

  const url = (vehicleId: string, path = ''): string =>
    `/api/v1/vehicles/${vehicleId}/maintenance-records${path}`;

  const call = (
    method: Method,
    path: string,
    actor: Actor | null = 'admin',
  ) => {
    const req = request(app.getHttpServer())[method](path);
    return actor === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[actor]}`);
  };

  const mkVehicle = (organizationId = orgAId) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Ford',
        model: 'Transit',
        year: 2022,
        vin: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17),
        licensePlate: `M${++seq}-${suffix.toUpperCase()}`,
      },
    });

  const payload = (o: Body = {}): Body => ({
    type: 'OIL_CHANGE',
    performedOn: day(-30),
    cost: '89.90',
    ...o,
  });

  const create = async (
    vehicleId: string,
    o: Body = {},
    actor: Actor = 'admin',
  ): Promise<Body> =>
    (await call('post', url(vehicleId), actor).send(payload(o)).expect(201))
      .body as Body;

  const vehicleOf = async (id: string, actor: Actor = 'admin') =>
    (await call('get', `/api/v1/vehicles/${id}`, actor).expect(200))
      .body as Body;

  const login = async (slug: string, email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ organizationSlug: slug, email, password })
      .expect(200);
    return (res.body as Body).accessToken as string;
  };

  const setupActor = async (
    actor: Actor,
    organizationId: string,
    slug: string,
    role: 'ADMIN' | 'MANAGER' | 'DRIVER',
  ) => {
    const email = `${actor.toLowerCase()}-${suffix}@example.test`;
    await prisma.user.create({
      data: {
        organizationId,
        email,
        firstName: 'Test',
        lastName: actor,
        passwordHash: await hash(password),
        role,
      },
    });
    tokens[actor] = await login(slug, email);
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const slugA = `mnt-a-${suffix}`;
    const slugB = `mnt-b-${suffix}`;
    const orgA = await prisma.organization.create({
      data: { name: `Mnt A ${suffix}`, slug: slugA },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Mnt B ${suffix}`, slug: slugB },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgIds.push(orgAId, orgBId);

    await setupActor('admin', orgAId, slugA, 'ADMIN');
    await setupActor('manager', orgAId, slugA, 'MANAGER');
    await setupActor('driver', orgAId, slugA, 'DRIVER');
    await setupActor('adminB', orgBId, slugB, 'ADMIN');
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgIds.length > 0) {
        const where = { organizationId: { in: orgIds } };
        await prisma.maintenanceRecord.deleteMany({ where });
        await prisma.fuelLog.deleteMany({ where });
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
    const someVehicle = randomUUID();
    const someId = randomUUID();
    const routes: [Method, string][] = [
      ['get', url(someVehicle)],
      ['post', url(someVehicle)],
      ['get', url(someVehicle, `/${someId}`)],
      ['patch', url(someVehicle, `/${someId}`)],
      ['delete', url(someVehicle, `/${someId}`)],
    ];

    it.each(routes)('%s %s without a token returns 401', async (m, path) => {
      const res = await call(m, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it.each(routes)('%s %s as DRIVER returns 403', async (m, path) => {
      const res = await call(m, path, 'driver').send({ bad: true });
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('MANAGER can create, read, update and delete', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, {}, 'manager');
      const id = rec.id as string;
      await call('get', url(v.id), 'manager').expect(200);
      await call('get', url(v.id, `/${id}`), 'manager').expect(200);
      await call('patch', url(v.id, `/${id}`), 'manager')
        .send({ vendor: 'Mgr' })
        .expect(200);
      await call('delete', url(v.id, `/${id}`), 'manager').expect(204);
    });
  });

  describe('POST', () => {
    it('creates a record with exactly 11 keys and normalized values', async () => {
      const v = await mkVehicle();
      const res = await call('post', url(v.id))
        .send(
          payload({
            cost: '89.9',
            description: '  Synthetic ',
            vendor: ' Joe ',
            odometerKm: 120000,
          }),
        )
        .expect(201);
      const body = res.body as Body;
      expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
      expect(body.id).toMatch(UUID_V7_RE);
      expect(body).toMatchObject({
        vehicleId: v.id,
        type: 'OIL_CHANGE',
        description: 'Synthetic',
        vendor: 'Joe',
        performedOn: day(-30),
        odometerKm: 120000,
        cost: '89.90',
        nextServiceDueOn: null,
      });
      const row = await prisma.maintenanceRecord.findUnique({
        where: { id: body.id as string },
      });
      expect(row?.organizationId).toBe(orgAId);
    });

    it('defaults optional fields to null and keeps cost 0 as "0.00"', async () => {
      const v = await mkVehicle();
      const body = await create(v.id, { cost: '0' });
      expect(body).toMatchObject({
        description: null,
        vendor: null,
        odometerKm: null,
        nextServiceDueOn: null,
        cost: '0.00',
      });
    });

    it('rejects a JSON number cost with 400', async () => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(payload({ cost: 89.9 }))
        .expect(400);
    });

    it('accepts performedOn up to tomorrow and rejects beyond', async () => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(payload({ performedOn: day(1) }))
        .expect(201);
      await call('post', url(v.id))
        .send(payload({ performedOn: day(3) }))
        .expect(400);
    });

    it('rejects performedOn before 1900', async () => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(payload({ performedOn: '1899-12-31' }))
        .expect(400);
    });

    it.each([0, -5])(
      'rejects nextServiceDueOn on/before performedOn (offset %i)',
      async (offset) => {
        const v = await mkVehicle();
        const res = await call('post', url(v.id))
          .send(
            payload({
              performedOn: day(-30),
              nextServiceDueOn: day(-30 + offset),
            }),
          )
          .expect(400);
        expect((res.body as Body).message).toBe(DUE_MSG);
        expect(
          await prisma.maintenanceRecord.count({ where: { vehicleId: v.id } }),
        ).toBe(0);
      },
    );

    it.each<[string, Body]>([
      ['empty body', {}],
      ['bad type', { type: 'NOPE' }],
      ['blank description', { description: '  ' }],
      ['long vendor', { vendor: 'a'.repeat(101) }],
      ['negative odometer', { odometerKm: -1 }],
      ['string odometer', { odometerKm: '5' }],
      ['bad cost', { cost: '12.345' }],
      ['invalid date', { performedOn: '2026-02-30' }],
      ['unknown key', { extra: 1 }],
      ['vehicleId in body', { vehicleId: randomUUID() }],
      ['organizationId', { organizationId: randomUUID() }],
    ])('returns 400 for %s', async (name, override) => {
      const v = await mkVehicle();
      const body = name === 'empty body' ? {} : payload(override);
      await call('post', url(v.id)).send(body).expect(400);
    });

    it('returns 404 Vehicle not found for a missing vehicle', async () => {
      const gone = await mkVehicle();
      await prisma.vehicle.delete({ where: { id: gone.id } });
      const res = await call('post', url(gone.id)).send(payload()).expect(404);
      expect((res.body as Body).message).toBe(NO_VEHICLE);
    });

    it('returns 404 Vehicle not found for an org B vehicle and creates nothing', async () => {
      const vb = await mkVehicle(orgBId);
      const res = await call('post', url(vb.id)).send(payload()).expect(404);
      expect((res.body as Body).message).toBe(NO_VEHICLE);
      expect(
        await prisma.maintenanceRecord.count({ where: { vehicleId: vb.id } }),
      ).toBe(0);
    });

    it('returns 400 for a malformed or non-v7 vehicleId', async () => {
      for (const id of ['abc', randomUUID()]) {
        const res = await call('post', url(id)).send(payload()).expect(400);
        expect((res.body as Body).message).toBe(BAD_UUID);
      }
    });
  });

  describe('vehicle service status', () => {
    it('is UNKNOWN/null for a vehicle without records', async () => {
      const v = await mkVehicle();
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'UNKNOWN',
        nextServiceDueOn: null,
      });
    });

    it('is DUE_SOON for a due date in 10 days', async () => {
      const v = await mkVehicle();
      await create(v.id, { nextServiceDueOn: day(10) });
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'DUE_SOON',
        nextServiceDueOn: day(10),
      });
    });

    it('is OVERDUE for a past due date', async () => {
      const v = await mkVehicle();
      await create(v.id, { performedOn: day(-60), nextServiceDueOn: day(-20) });
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'OVERDUE',
        nextServiceDueOn: day(-20),
      });
    });

    it('is OK for a due date in 60 days', async () => {
      const v = await mkVehicle();
      await create(v.id, { nextServiceDueOn: day(60) });
      expect((await vehicleOf(v.id)).serviceStatus).toBe('OK');
    });

    it('follows the latest performedOn record and falls back on delete', async () => {
      const v = await mkVehicle();
      const older = await create(v.id, {
        performedOn: day(-30),
        nextServiceDueOn: day(10),
      });
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'DUE_SOON',
        nextServiceDueOn: day(10),
      });
      const newer = await create(v.id, {
        performedOn: day(-5),
        nextServiceDueOn: day(60),
      });
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'OK',
        nextServiceDueOn: day(60),
      });
      // a newer record without a due date does not change the vehicle
      await create(v.id, { performedOn: day(-1) });
      expect((await vehicleOf(v.id)).nextServiceDueOn).toBe(day(60));

      await call('delete', url(v.id, `/${newer.id as string}`)).expect(204);
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'DUE_SOON',
        nextServiceDueOn: day(10),
      });
      await call('delete', url(v.id, `/${older.id as string}`)).expect(204);
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'UNKNOWN',
        nextServiceDueOn: null,
      });
    });

    it('PATCH nextServiceDueOn null on the only record gives UNKNOWN/null', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, { nextServiceDueOn: day(10) });
      const res = await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ nextServiceDueOn: null })
        .expect(200);
      expect((res.body as Body).nextServiceDueOn).toBeNull();
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'UNKNOWN',
        nextServiceDueOn: null,
      });
    });

    it('PATCH to a new due date recomputes the status', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, { nextServiceDueOn: day(10) });
      await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ nextServiceDueOn: day(90) })
        .expect(200);
      expect(await vehicleOf(v.id)).toMatchObject({
        serviceStatus: 'OK',
        nextServiceDueOn: day(90),
      });
    });

    it('GET /vehicles?serviceStatus=DUE_SOON only returns matching vehicles of the caller org', async () => {
      const dueSoon = await mkVehicle();
      const ok = await mkVehicle();
      const none = await mkVehicle();
      const otherOrg = await mkVehicle(orgBId);
      await create(dueSoon.id, { nextServiceDueOn: day(10) });
      await create(ok.id, { nextServiceDueOn: day(60) });
      await prisma.vehicle.update({
        where: { id: otherOrg.id },
        data: {
          serviceStatus: 'DUE_SOON',
          nextServiceDueOn: new Date(day(10)),
        },
      });
      const res = await call(
        'get',
        '/api/v1/vehicles?serviceStatus=DUE_SOON&limit=100',
      ).expect(200);
      const ids = (res.body as { data: Body[] }).data.map((d) => d.id);
      expect(ids).toContain(dueSoon.id);
      expect(ids).not.toContain(ok.id);
      expect(ids).not.toContain(none.id);
      expect(ids).not.toContain(otherOrg.id);
      for (const d of (res.body as { data: Body[] }).data) {
        expect(d.serviceStatus).toBe('DUE_SOON');
      }
      await call('get', '/api/v1/vehicles?serviceStatus=late').expect(400);
    });
  });

  describe('GET list and single', () => {
    let v: { id: string };
    let r1: Body; // oldest, TIRES
    let r2: Body; // OIL_CHANGE
    let r3: Body; // newest, TIRES

    beforeAll(async () => {
      v = await mkVehicle();
      r1 = await create(v.id, { type: 'TIRES', performedOn: day(-100) });
      r2 = await create(v.id, { type: 'OIL_CHANGE', performedOn: day(-50) });
      r3 = await create(v.id, { type: 'TIRES', performedOn: day(-10) });
    });

    const list = async (qs: string, actor: Actor = 'admin') => {
      const res = await call('get', `${url(v.id)}${qs}`, actor).expect(200);
      return res.body as {
        data: Body[];
        meta: { page: number; limit: number; total: number };
      };
    };

    it('lists newest first with meta', async () => {
      const body = await list('');
      expect(body.data.map((d) => d.id)).toEqual([r3.id, r2.id, r1.id]);
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 3 });
      expect(Object.keys(body.data[0]).sort()).toEqual(RESPONSE_KEYS);
    });

    it('paginates', async () => {
      const p2 = await list('?limit=2&page=2');
      expect(p2.data.map((d) => d.id)).toEqual([r1.id]);
      expect(p2.meta).toEqual({ page: 2, limit: 2, total: 3 });
      expect((await list('?page=9')).data).toEqual([]);
    });

    it('filters by type', async () => {
      const body = await list('?type=TIRES');
      expect(body.data.map((d) => d.id)).toEqual([r3.id, r1.id]);
      expect(body.meta.total).toBe(2);
    });

    it('filters by inclusive from/to', async () => {
      const exact = await list(`?from=${day(-50)}&to=${day(-50)}`);
      expect(exact.data.map((d) => d.id)).toEqual([r2.id]);
      const range = await list(`?from=${day(-100)}&to=${day(-50)}`);
      expect(range.data.map((d) => d.id)).toEqual([r2.id, r1.id]);
      const fromOnly = await list(`?from=${day(-50)}`);
      expect(fromOnly.data.map((d) => d.id)).toEqual([r3.id, r2.id]);
      const toOnly = await list(`?to=${day(-50)}`);
      expect(toOnly.data.map((d) => d.id)).toEqual([r2.id, r1.id]);
    });

    it('returns 400 for from > to (even for an unknown vehicle)', async () => {
      await call('get', `${url(v.id)}?from=${day(-1)}&to=${day(-5)}`).expect(
        400,
      );
      const res = await call(
        'get',
        `${url(randomUUID().replace(/^(.{14})4/, '$17'))}?from=${day(-1)}&to=${day(-5)}`,
      ).expect(400);
      expect((res.body as Body).message).toBe('from must not be after to');
    });

    it.each([
      'type=NOPE',
      'page=0',
      'limit=101',
      'from=2026-02-30',
      'to=x',
      'foo=bar',
    ])('returns 400 for ?%s', async (qs) => {
      await call('get', `${url(v.id)}?${qs}`).expect(400);
    });

    it('returns 404 Vehicle not found for an org B vehicle', async () => {
      const vb = await mkVehicle(orgBId);
      const res = await call('get', url(vb.id)).expect(404);
      expect((res.body as Body).message).toBe(NO_VEHICLE);
    });

    it('GET one returns the record', async () => {
      const res = await call('get', url(v.id, `/${r2.id as string}`)).expect(
        200,
      );
      expect(res.body).toEqual(r2);
    });

    it('GET one under another vehicle of the same org is 404', async () => {
      const other = await mkVehicle();
      const res = await call(
        'get',
        url(other.id, `/${r2.id as string}`),
      ).expect(404);
      expect((res.body as Body).message).toBe(NO_RECORD);
    });

    it('GET one from org B is 404', async () => {
      const res = await call(
        'get',
        url(v.id, `/${r2.id as string}`),
        'adminB',
      ).expect(404);
      expect((res.body as Body).message).toBe(NO_RECORD);
    });

    it('returns 400 for bad vehicleId or id', async () => {
      const a = await call('get', url('abc', `/${r2.id as string}`)).expect(
        400,
      );
      expect((a.body as Body).message).toBe(BAD_UUID);
      const b = await call('get', url(v.id, '/abc')).expect(400);
      expect((b.body as Body).message).toBe(BAD_UUID);
    });
  });

  describe('PATCH and DELETE', () => {
    it('PATCH updates only provided fields', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, { description: 'keep', odometerKm: 10 });
      const res = await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ cost: '5', vendor: 'New' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: rec.id,
        cost: '5.00',
        vendor: 'New',
        description: 'keep',
        odometerKm: 10,
        performedOn: rec.performedOn,
      });
      expect(Object.keys(res.body as Body).sort()).toEqual(RESPONSE_KEYS);
    });

    it('PATCH null clears nullable fields', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, {
        description: 'x',
        vendor: 'y',
        odometerKm: 3,
      });
      const res = await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ description: null, vendor: null, odometerKm: null })
        .expect(200);
      expect(res.body).toMatchObject({
        description: null,
        vendor: null,
        odometerKm: null,
      });
    });

    it.each(['type', 'performedOn', 'cost'])(
      'PATCH null %s returns 400',
      async (field) => {
        const v = await mkVehicle();
        const rec = await create(v.id);
        await call('patch', url(v.id, `/${rec.id as string}`))
          .send({ [field]: null })
          .expect(400);
      },
    );

    it('PATCH changing only performedOn past the existing due date returns 400', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, {
        performedOn: day(-30),
        nextServiceDueOn: day(-5),
      });
      const res = await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ performedOn: day(-3) })
        .expect(400);
      expect((res.body as Body).message).toBe(DUE_MSG);
      expect(await vehicleOf(v.id)).toMatchObject({
        nextServiceDueOn: day(-5),
        serviceStatus: 'OVERDUE',
      });
      const row = await prisma.maintenanceRecord.findUnique({
        where: { id: rec.id as string },
      });
      expect(row?.performedOn.toISOString().slice(0, 10)).toBe(day(-30));
    });

    it('PATCH nextServiceDueOn on/before the existing performedOn returns 400', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, { performedOn: day(-30) });
      await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ nextServiceDueOn: day(-30) })
        .expect(400);
    });

    it('PATCH rejects unknown and server-owned keys', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id);
      for (const key of ['vehicleId', 'organizationId', 'id', 'extra']) {
        await call('patch', url(v.id, `/${rec.id as string}`))
          .send({ [key]: randomUUID() })
          .expect(400);
      }
    });

    it('PATCH on a missing record is 404', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id);
      await call('delete', url(v.id, `/${rec.id as string}`)).expect(204);
      const res = await call('patch', url(v.id, `/${rec.id as string}`))
        .send({ cost: '1' })
        .expect(404);
      expect((res.body as Body).message).toBe(NO_RECORD);
    });

    it('cross-tenant PATCH/DELETE give 404 and leave the row and vehicle unchanged', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id, { nextServiceDueOn: day(10) });
      const before = await prisma.maintenanceRecord.findUnique({
        where: { id: rec.id as string },
      });
      const vehicleBefore = await vehicleOf(v.id);

      const patch = await call(
        'patch',
        url(v.id, `/${rec.id as string}`),
        'adminB',
      )
        .send({ cost: '999', nextServiceDueOn: null })
        .expect(404);
      expect((patch.body as Body).message).toBe(NO_RECORD);
      const del = await call(
        'delete',
        url(v.id, `/${rec.id as string}`),
        'adminB',
      ).expect(404);
      expect((del.body as Body).message).toBe(NO_RECORD);

      expect(
        await prisma.maintenanceRecord.findUnique({
          where: { id: rec.id as string },
        }),
      ).toEqual(before);
      expect(await vehicleOf(v.id)).toEqual(vehicleBefore);
    });

    it('PATCH/DELETE through a different vehicle of the same org is 404', async () => {
      const v = await mkVehicle();
      const other = await mkVehicle();
      const rec = await create(v.id, { nextServiceDueOn: day(10) });
      await call('patch', url(other.id, `/${rec.id as string}`))
        .send({ cost: '1' })
        .expect(404);
      await call('delete', url(other.id, `/${rec.id as string}`)).expect(404);
      expect(
        await prisma.maintenanceRecord.findUnique({
          where: { id: rec.id as string },
        }),
      ).not.toBeNull();
      expect((await vehicleOf(other.id)).serviceStatus).toBe('UNKNOWN');
      expect((await vehicleOf(v.id)).serviceStatus).toBe('DUE_SOON');
    });

    it('DELETE returns 204 with an empty body, then 404', async () => {
      const v = await mkVehicle();
      const rec = await create(v.id);
      const res = await call(
        'delete',
        url(v.id, `/${rec.id as string}`),
      ).expect(204);
      expect(res.text).toBe('');
      await call('delete', url(v.id, `/${rec.id as string}`)).expect(404);
      await call('get', url(v.id, `/${rec.id as string}`)).expect(404);
    });

    it('DELETE with bad ids returns 400', async () => {
      const v = await mkVehicle();
      await call('delete', url(v.id, '/abc')).expect(400);
      await call('delete', url('abc', `/${randomUUID()}`)).expect(400);
    });
  });

  describe('concurrency', () => {
    it('two concurrent creates leave the vehicle matching the latest record by ordering', async () => {
      const v = await mkVehicle();
      const performedOn = day(-20);
      const [a, b] = await Promise.all([
        call('post', url(v.id)).send(
          payload({ performedOn, nextServiceDueOn: day(10) }),
        ),
        call('post', url(v.id)).send(
          payload({ performedOn, nextServiceDueOn: day(60) }),
        ),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);

      const latest = await prisma.maintenanceRecord.findFirst({
        where: {
          organizationId: orgAId,
          vehicleId: v.id,
          nextServiceDueOn: { not: null },
        },
        orderBy: [
          { performedOn: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });
      const vehicle = await prisma.vehicle.findUnique({ where: { id: v.id } });
      expect(latest).not.toBeNull();
      expect(vehicle?.nextServiceDueOn?.toISOString()).toBe(
        latest?.nextServiceDueOn?.toISOString(),
      );
      const expectedStatus =
        day(10) === latest?.nextServiceDueOn?.toISOString().slice(0, 10)
          ? 'DUE_SOON'
          : 'OK';
      expect(vehicle?.serviceStatus).toBe(expectedStatus);
      expect(
        await prisma.maintenanceRecord.count({ where: { vehicleId: v.id } }),
      ).toBe(2);
    });

    it('concurrent create and delete on one vehicle stay consistent', async () => {
      const v = await mkVehicle();
      const first = await create(v.id, {
        performedOn: day(-30),
        nextServiceDueOn: day(10),
      });
      const [c, d] = await Promise.all([
        call('post', url(v.id)).send(
          payload({ performedOn: day(-10), nextServiceDueOn: day(60) }),
        ),
        call('delete', url(v.id, `/${first.id as string}`)),
      ]);
      expect(c.status).toBe(201);
      expect(d.status).toBe(204);
      const vehicle = await prisma.vehicle.findUnique({ where: { id: v.id } });
      expect(vehicle?.nextServiceDueOn?.toISOString().slice(0, 10)).toBe(
        day(60),
      );
      expect(vehicle?.serviceStatus).toBe('OK');
    });
  });

  describe('daily service status job', () => {
    it('advances only stale statuses of its own rows and a second run is a no-op for them', async () => {
      const job = app.get(ServiceStatusJob);
      const stale = await mkVehicle();
      const unknown = await mkVehicle();
      const fresh = await mkVehicle();
      await prisma.vehicle.update({
        where: { id: stale.id },
        data: { nextServiceDueOn: new Date(day(-1)), serviceStatus: 'OK' },
      });
      await prisma.vehicle.update({
        where: { id: unknown.id },
        data: { nextServiceDueOn: new Date(day(5)), serviceStatus: 'UNKNOWN' },
      });
      await prisma.vehicle.update({
        where: { id: fresh.id },
        data: { nextServiceDueOn: new Date(day(60)), serviceStatus: 'OK' },
      });
      const freshBefore = await prisma.vehicle.findUnique({
        where: { id: fresh.id },
      });

      const result = await job.refreshServiceStatuses();
      expect(result.overdue).toBeGreaterThanOrEqual(1);
      expect(result.dueSoon).toBeGreaterThanOrEqual(1);

      const own = { id: { in: [stale.id, unknown.id, fresh.id] } };
      const after = await prisma.vehicle.findMany({ where: own });
      const byId = new Map(after.map((r) => [r.id, r]));
      expect(byId.get(stale.id)?.serviceStatus).toBe('OVERDUE');
      expect(byId.get(unknown.id)?.serviceStatus).toBe('DUE_SOON');
      expect(byId.get(fresh.id)?.serviceStatus).toBe('OK');
      // the already-correct row is untouched
      expect(byId.get(fresh.id)?.updatedAt).toEqual(freshBefore?.updatedAt);

      await job.refreshServiceStatuses();
      const again = await prisma.vehicle.findMany({ where: own });
      for (const row of again) {
        expect(row).toEqual(byId.get(row.id));
      }
    });
  });

  describe('deleting a vehicle with a maintenance record', () => {
    it('DELETE /vehicles/:id returns 409 with related records message', async () => {
      const v = await mkVehicle();
      await create(v.id);
      const res = await call('delete', `/api/v1/vehicles/${v.id}`).expect(409);
      expect((res.body as Body).message).toBe(
        'Vehicle has related records and cannot be deleted',
      );
      expect(
        await prisma.vehicle.findUnique({ where: { id: v.id } }),
      ).not.toBeNull();
    });
  });
});
