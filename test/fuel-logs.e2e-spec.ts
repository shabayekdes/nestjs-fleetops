import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { errorBody } from './utils/error-body.js';

type Body = Record<string, unknown>;
type Actor = 'admin' | 'manager' | 'driver' | 'adminB';
type Method = 'get' | 'post' | 'patch' | 'delete';

const RESPONSE_KEYS = [
  'createdAt',
  'fueledOn',
  'id',
  'liters',
  'odometerKm',
  'totalCost',
  'updatedAt',
  'vehicleId',
];
const FORBIDDEN = errorBody(403, 'Forbidden');
const UNAUTHORIZED = errorBody(401, 'Unauthorized');
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';
const NO_VEHICLE = 'Vehicle not found';
const NO_LOG = 'Fuel log not found';

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

describe('Fuel logs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Fuel-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;
  const tokens = {} as Record<Actor, string>;

  const url = (vehicleId: string, path = ''): string =>
    `/api/v1/vehicles/${vehicleId}/fuel-logs${path}`;

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
        licensePlate: `F${++seq}-${suffix.toUpperCase()}`,
      },
    });

  const payload = (o: Body = {}): Body => ({
    fueledOn: day(-10),
    liters: '45.5',
    totalCost: '80',
    ...o,
  });

  const create = async (
    vehicleId: string,
    o: Body = {},
    actor: Actor = 'admin',
  ): Promise<Body> =>
    (await call('post', url(vehicleId), actor).send(payload(o)).expect(201))
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

    const slugA = `fuel-a-${suffix}`;
    const slugB = `fuel-b-${suffix}`;
    const orgA = await prisma.organization.create({
      data: { name: `Fuel A ${suffix}`, slug: slugA },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Fuel B ${suffix}`, slug: slugB },
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
      const log = await create(v.id, {}, 'manager');
      const id = log.id as string;
      await call('get', url(v.id), 'manager').expect(200);
      await call('get', url(v.id, `/${id}`), 'manager').expect(200);
      await call('patch', url(v.id, `/${id}`), 'manager')
        .send({ odometerKm: 5 })
        .expect(200);
      await call('delete', url(v.id, `/${id}`), 'manager').expect(204);
    });
  });

  describe('POST', () => {
    it('creates a log with exactly 8 keys and fixed-scale decimals', async () => {
      const v = await mkVehicle();
      const res = await call('post', url(v.id))
        .send(payload({ liters: '45.5', totalCost: '80', odometerKm: 1234 }))
        .expect(201);
      const body = res.body as Body;
      expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
      expect(body.id).toMatch(UUID_V7_RE);
      expect(body).toMatchObject({
        vehicleId: v.id,
        fueledOn: day(-10),
        liters: '45.500',
        totalCost: '80.00',
        odometerKm: 1234,
      });
      expect(body).not.toHaveProperty('organizationId');
      const row = await prisma.fuelLog.findUnique({
        where: { id: body.id as string },
      });
      expect(row?.organizationId).toBe(orgAId);
    });

    it('defaults odometerKm to null', async () => {
      const v = await mkVehicle();
      expect((await create(v.id)).odometerKm).toBeNull();
    });

    it('allows totalCost "0" and several fill-ups on one day', async () => {
      const v = await mkVehicle();
      const a = await create(v.id, { totalCost: '0' });
      const b = await create(v.id, { totalCost: '0' });
      expect(a.totalCost).toBe('0.00');
      expect(a.id).not.toBe(b.id);
    });

    it.each(['0', '0.000', '100000', '1.2345', '-1'])(
      'rejects liters %j',
      async (liters) => {
        const v = await mkVehicle();
        await call('post', url(v.id)).send(payload({ liters })).expect(400);
      },
    );

    it('rejects JSON number liters and totalCost', async () => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(payload({ liters: 45.5 }))
        .expect(400);
      await call('post', url(v.id))
        .send(payload({ totalCost: 80 }))
        .expect(400);
    });

    it('accepts fueledOn up to tomorrow and rejects beyond or before 1900', async () => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(payload({ fueledOn: day(1) }))
        .expect(201);
      await call('post', url(v.id))
        .send(payload({ fueledOn: day(3) }))
        .expect(400);
      await call('post', url(v.id))
        .send(payload({ fueledOn: '1899-12-31' }))
        .expect(400);
    });

    it.each<[string, Body]>([
      ['empty body', {}],
      ['bad totalCost', { totalCost: '1.234' }],
      ['bad odometer', { odometerKm: -1 }],
      ['driverId', { driverId: randomUUID() }],
      ['vehicleId in body', { vehicleId: randomUUID() }],
      ['organizationId', { organizationId: randomUUID() }],
      ['unknown key', { extra: 1 }],
    ])('returns 400 for %s', async (name, override) => {
      const v = await mkVehicle();
      await call('post', url(v.id))
        .send(name === 'empty body' ? {} : payload(override))
        .expect(400);
    });

    it('returns 404 Vehicle not found for a missing or org B vehicle', async () => {
      const gone = await mkVehicle();
      await prisma.vehicle.delete({ where: { id: gone.id } });
      const vb = await mkVehicle(orgBId);
      for (const id of [gone.id, vb.id]) {
        const res = await call('post', url(id)).send(payload()).expect(404);
        expect((res.body as Body).message).toBe(NO_VEHICLE);
      }
      expect(await prisma.fuelLog.count({ where: { vehicleId: vb.id } })).toBe(
        0,
      );
    });

    it('returns 400 for a bad vehicleId', async () => {
      const res = await call('post', url('abc')).send(payload()).expect(400);
      expect((res.body as Body).message).toBe(BAD_UUID);
    });

    it('does not affect the vehicle service status', async () => {
      const v = await mkVehicle();
      await create(v.id);
      const res = await call('get', `/api/v1/vehicles/${v.id}`).expect(200);
      expect(res.body).toMatchObject({
        serviceStatus: 'UNKNOWN',
        nextServiceDueOn: null,
      });
    });
  });

  describe('GET list and single', () => {
    let v: { id: string };
    let l1: Body;
    let l2: Body;
    let l3: Body;

    beforeAll(async () => {
      v = await mkVehicle();
      l1 = await create(v.id, { fueledOn: day(-100) });
      l2 = await create(v.id, { fueledOn: day(-50) });
      l3 = await create(v.id, { fueledOn: day(-10) });
    });

    const list = async (qs: string, actor: Actor = 'admin') =>
      (await call('get', `${url(v.id)}${qs}`, actor).expect(200)).body as {
        data: Body[];
        meta: { page: number; limit: number; total: number };
      };

    it('lists newest first with meta', async () => {
      const body = await list('');
      expect(body.data.map((d) => d.id)).toEqual([l3.id, l2.id, l1.id]);
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 3 });
      expect(Object.keys(body.data[0]).sort()).toEqual(RESPONSE_KEYS);
    });

    it('paginates', async () => {
      const p2 = await list('?limit=2&page=2');
      expect(p2.data.map((d) => d.id)).toEqual([l1.id]);
      expect(p2.meta).toEqual({ page: 2, limit: 2, total: 3 });
      expect((await list('?page=9')).data).toEqual([]);
    });

    it('filters by inclusive from/to', async () => {
      expect(
        (await list(`?from=${day(-50)}&to=${day(-50)}`)).data.map((d) => d.id),
      ).toEqual([l2.id]);
      expect(
        (await list(`?from=${day(-100)}&to=${day(-50)}`)).data.map((d) => d.id),
      ).toEqual([l2.id, l1.id]);
    });

    it('returns 400 for from > to and other bad queries', async () => {
      const res = await call(
        'get',
        `${url(v.id)}?from=${day(-1)}&to=${day(-5)}`,
      ).expect(400);
      expect((res.body as Body).message).toBe('from must not be after to');
      for (const qs of ['page=0', 'limit=101', 'from=x', 'type=TIRES']) {
        await call('get', `${url(v.id)}?${qs}`).expect(400);
      }
    });

    it('returns 404 Vehicle not found for an org B vehicle', async () => {
      const vb = await mkVehicle(orgBId);
      const res = await call('get', url(vb.id)).expect(404);
      expect((res.body as Body).message).toBe(NO_VEHICLE);
    });

    it('never lists another org vehicle logs', async () => {
      const res = await call('get', url(v.id), 'adminB').expect(404);
      expect((res.body as Body).message).toBe(NO_VEHICLE);
    });

    it('GET one returns the log; wrong vehicle, other org and bad ids fail', async () => {
      const ok = await call('get', url(v.id, `/${l2.id as string}`)).expect(
        200,
      );
      expect(ok.body).toEqual(l2);
      const other = await mkVehicle();
      const wrong = await call(
        'get',
        url(other.id, `/${l2.id as string}`),
      ).expect(404);
      expect((wrong.body as Body).message).toBe(NO_LOG);
      const cross = await call(
        'get',
        url(v.id, `/${l2.id as string}`),
        'adminB',
      ).expect(404);
      expect((cross.body as Body).message).toBe(NO_LOG);
      const bad = await call('get', url(v.id, '/abc')).expect(400);
      expect((bad.body as Body).message).toBe(BAD_UUID);
    });
  });

  describe('PATCH and DELETE', () => {
    it('PATCH updates provided fields and normalizes decimals', async () => {
      const v = await mkVehicle();
      const log = await create(v.id, { odometerKm: 10 });
      const res = await call('patch', url(v.id, `/${log.id as string}`))
        .send({ liters: '10', totalCost: '12.5' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: log.id,
        liters: '10.000',
        totalCost: '12.50',
        odometerKm: 10,
        fueledOn: log.fueledOn,
      });
      expect(Object.keys(res.body as Body).sort()).toEqual(RESPONSE_KEYS);
    });

    it('PATCH odometerKm null clears it', async () => {
      const v = await mkVehicle();
      const log = await create(v.id, { odometerKm: 10 });
      const res = await call('patch', url(v.id, `/${log.id as string}`))
        .send({ odometerKm: null })
        .expect(200);
      expect((res.body as Body).odometerKm).toBeNull();
    });

    it.each(['fueledOn', 'liters', 'totalCost'])(
      'PATCH null %s returns 400',
      async (field) => {
        const v = await mkVehicle();
        const log = await create(v.id);
        await call('patch', url(v.id, `/${log.id as string}`))
          .send({ [field]: null })
          .expect(400);
      },
    );

    it('PATCH rejects invalid values and server-owned keys', async () => {
      const v = await mkVehicle();
      const log = await create(v.id);
      const p = url(v.id, `/${log.id as string}`);
      await call('patch', p).send({ liters: '0' }).expect(400);
      await call('patch', p)
        .send({ fueledOn: day(5) })
        .expect(400);
      await call('patch', p).send({ vehicleId: randomUUID() }).expect(400);
      await call('patch', p).send({ organizationId: randomUUID() }).expect(400);
    });

    it('cross-tenant and wrong-vehicle PATCH/DELETE give 404 and leave the row unchanged', async () => {
      const v = await mkVehicle();
      const other = await mkVehicle();
      const log = await create(v.id);
      const before = await prisma.fuelLog.findUnique({
        where: { id: log.id as string },
      });
      const p = `/${log.id as string}`;
      for (const [vehicleId, actor] of [
        [v.id, 'adminB'],
        [other.id, 'admin'],
      ] as const) {
        const patch = await call('patch', url(vehicleId, p), actor)
          .send({ liters: '999' })
          .expect(404);
        expect((patch.body as Body).message).toBe(NO_LOG);
        const del = await call('delete', url(vehicleId, p), actor).expect(404);
        expect((del.body as Body).message).toBe(NO_LOG);
      }
      expect(
        await prisma.fuelLog.findUnique({ where: { id: log.id as string } }),
      ).toEqual(before);
    });

    it('DELETE returns 204 then 404', async () => {
      const v = await mkVehicle();
      const log = await create(v.id);
      const res = await call(
        'delete',
        url(v.id, `/${log.id as string}`),
      ).expect(204);
      expect(res.text).toBe('');
      await call('delete', url(v.id, `/${log.id as string}`)).expect(404);
      await call('patch', url(v.id, `/${log.id as string}`))
        .send({ liters: '1' })
        .expect(404);
    });

    it('DELETE with a bad id returns 400', async () => {
      const v = await mkVehicle();
      await call('delete', url(v.id, '/abc')).expect(400);
    });
  });

  describe('deleting a vehicle with a fuel log', () => {
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
