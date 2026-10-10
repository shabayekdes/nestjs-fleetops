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
type Actor = 'admin' | 'manager' | 'driver' | 'adminB';
type Method = 'get' | 'post' | 'patch' | 'delete';

const BASE = '/api/v1/assignments';
const RESPONSE_KEYS = [
  'createdAt',
  'driver',
  'endedAt',
  'id',
  'startedAt',
  'updatedAt',
  'vehicle',
];
const VEHICLE_KEYS = ['id', 'licensePlate', 'make', 'model', 'vin'];
const DRIVER_KEYS = ['firstName', 'id', 'lastName', 'licenseNumber'];
const FORBIDDEN = errorBody(403, 'Forbidden');
const UNAUTHORIZED = errorBody(401, 'Unauthorized');
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';
const VEHICLE_BUSY = 'Vehicle already has an active assignment';
const DRIVER_BUSY = 'Driver already has an active assignment';

const dateOnly = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

describe('Assignments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let catalog: TestCatalog;

  const suffix = randomUUID().slice(0, 8);
  const password = `Asg-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;

  const tokens = {} as Record<Actor, string>;

  const api = (method: Method, path: string, actor: Actor | null = 'admin') => {
    const req = request(app.getHttpServer())[method](`${BASE}${path}`);
    return actor === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[actor]}`);
  };

  const mkVehicle = (organizationId = orgAId) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        makeId: catalog.makeA.id,
        modelId: catalog.modelA1.id,
        vehicleTypeId: catalog.type.id,
        year: 2022,
        vin: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17),
        licensePlate: `A${++seq}-${suffix.toUpperCase()}`,
      },
    });

  const mkDriver = (
    organizationId = orgAId,
    licenseExpiresOn: Date = new Date(Date.UTC(2099, 0, 1)),
  ) =>
    prisma.driver.create({
      data: {
        organizationId,
        firstName: 'Dana',
        lastName: 'Driver',
        licenseNumber: `ASG${++seq}-${suffix.toUpperCase()}`,
        licenseExpiresOn,
      },
    });

  const assign = (
    vehicleId: string,
    driverId: string,
    actor: Actor = 'admin',
  ) => api('post', '', actor).send({ vehicleId, driverId });

  const assignOk = async (vehicleId: string, driverId: string) =>
    (await assign(vehicleId, driverId).expect(201)).body as Body;

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

  const dbAsg = (id: string) =>
    prisma.vehicleAssignment.findUnique({ where: { id } });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    catalog = await createTestCatalog(prisma, suffix);

    const slugA = `asg-a-${suffix}`;
    const slugB = `asg-b-${suffix}`;
    const orgA = await prisma.organization.create({
      data: { name: `Asg A ${suffix}`, slug: slugA },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Asg B ${suffix}`, slug: slugB },
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
        await prisma.vehicleAssignment.deleteMany({ where });
        await prisma.driver.deleteMany({ where });
        await prisma.vehicle.deleteMany({ where });
        await prisma.user.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
      await catalog.cleanup();
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
      ['post', `/${someId}/end`],
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

    it('MANAGER can assign, read, list and end', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const created = (await assign(v.id, d.id, 'manager').expect(201))
        .body as Body;
      await api('get', `/${created.id as string}`, 'manager').expect(200);
      await api('get', `?vehicleId=${v.id}`, 'manager').expect(200);
      await api('post', `/${created.id as string}/end`, 'manager').expect(200);
    });
  });

  describe('POST /assignments', () => {
    it('creates an active assignment with the exact shape', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const before = Date.now();
      const body = await assignOk(v.id, d.id);
      expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
      expect(body.id).toMatch(UUID_V7_RE);
      expect(body.endedAt).toBeNull();
      expect(new Date(body.startedAt as string).getTime()).toBeGreaterThan(
        before - 5000,
      );
      const vehicle = body.vehicle as Body;
      expect(Object.keys(vehicle).sort()).toEqual(VEHICLE_KEYS);
      expect(vehicle).toMatchObject({
        id: v.id,
        make: catalog.makeA.name,
        model: catalog.modelA1.name,
        vin: v.vin,
        licensePlate: v.licensePlate,
      });
      const driver = body.driver as Body;
      expect(Object.keys(driver).sort()).toEqual(DRIVER_KEYS);
      expect(driver).toMatchObject({
        id: d.id,
        firstName: 'Dana',
        lastName: 'Driver',
        licenseNumber: d.licenseNumber,
      });
      expect(body).not.toHaveProperty('organizationId');
      expect((await dbAsg(body.id as string))?.organizationId).toBe(orgAId);
    });

    it('returns 409 when the vehicle already has an active assignment', async () => {
      const v = await mkVehicle();
      await assignOk(v.id, (await mkDriver()).id);
      const res = await assign(v.id, (await mkDriver()).id).expect(409);
      expect((res.body as Body).message).toBe(VEHICLE_BUSY);
    });

    it('returns 409 when the driver already has an active assignment', async () => {
      const d = await mkDriver();
      await assignOk((await mkVehicle()).id, d.id);
      const res = await assign((await mkVehicle()).id, d.id).expect(409);
      expect((res.body as Body).message).toBe(DRIVER_BUSY);
    });

    it('returns 422 for an expired license and creates nothing', async () => {
      const v = await mkVehicle();
      const d = await mkDriver(
        orgAId,
        dateOnly(new Date(Date.now() - 2 * 86_400_000)),
      );
      const res = await assign(v.id, d.id).expect(422);
      expect((res.body as Body).message).toBe('Driver license has expired');
      expect(
        await prisma.vehicleAssignment.count({ where: { vehicleId: v.id } }),
      ).toBe(0);
    });

    it('allows a license that expires today', async () => {
      const d = await mkDriver(orgAId, dateOnly(new Date()));
      await assignOk((await mkVehicle()).id, d.id);
    });

    it('returns 422 for a license that expired yesterday (UTC)', async () => {
      const d = await mkDriver(
        orgAId,
        dateOnly(new Date(Date.now() - 86_400_000)),
      );
      await assign((await mkVehicle()).id, d.id).expect(422);
    });

    it('returns 404 Vehicle not found for missing and other-org vehicles', async () => {
      const d = await mkDriver();
      const other = await mkVehicle(orgBId);
      for (const id of [other.id, randomUUID().replace(/^(.{14})4/, '$17')]) {
        const res = await assign(id, d.id).expect(404);
        expect((res.body as Body).message).toBe('Vehicle not found');
      }
      expect(
        await prisma.vehicleAssignment.count({ where: { driverId: d.id } }),
      ).toBe(0);
    });

    it('returns 404 Driver not found for missing and other-org drivers', async () => {
      const v = await mkVehicle();
      const other = await mkDriver(orgBId);
      for (const id of [other.id, v.id]) {
        const res = await assign(v.id, id).expect(404);
        expect((res.body as Body).message).toBe('Driver not found');
      }
    });

    it('does not let org B assign org A resources', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const res = await assign(v.id, d.id, 'adminB').expect(404);
      expect((res.body as Body).message).toBe('Vehicle not found');
    });

    it.each<[string, Body]>([
      ['empty body', {}],
      ['bad vehicleId', { vehicleId: 'nope', driverId: randomUUID() }],
      [
        'non-v7 driverId',
        {
          vehicleId: '01970000-0000-7000-8000-00000000beef',
          driverId: randomUUID(),
        },
      ],
      ['unknown key', { startedAt: '2020-01-01' }],
      ['organizationId', { organizationId: randomUUID() }],
    ])('returns 400 for %s', async (_n, body) => {
      await api('post', '').send(body).expect(400);
    });

    it('rejects server-owned fields alongside a valid body', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      await api('post', '')
        .send({ vehicleId: v.id, driverId: d.id, startedAt: '2000-01-01' })
        .expect(400);
    });
  });

  describe('POST /assignments/:id/end', () => {
    it('ends an assignment with 200 and endedAt >= startedAt', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const a = await assignOk(v.id, d.id);
      const res = await api('post', `/${a.id as string}/end`).expect(200);
      const body = res.body as Body;
      expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
      expect(body.id).toBe(a.id);
      expect(body.endedAt).not.toBeNull();
      expect(new Date(body.endedAt as string).getTime()).toBeGreaterThanOrEqual(
        new Date(body.startedAt as string).getTime(),
      );
      expect((await dbAsg(a.id as string))?.endedAt).not.toBeNull();
    });

    it('returns 409 when ending again and keeps the original endedAt', async () => {
      const a = await assignOk((await mkVehicle()).id, (await mkDriver()).id);
      const first = (await api('post', `/${a.id as string}/end`).expect(200))
        .body as Body;
      const res = await api('post', `/${a.id as string}/end`).expect(409);
      expect((res.body as Body).message).toBe('Assignment has already ended');
      expect((await dbAsg(a.id as string))?.endedAt?.toISOString()).toBe(
        first.endedAt,
      );
    });

    it('returns 404 from another org and leaves the assignment active', async () => {
      const a = await assignOk((await mkVehicle()).id, (await mkDriver()).id);
      const res = await api('post', `/${a.id as string}/end`, 'adminB').expect(
        404,
      );
      expect((res.body as Body).message).toBe('Assignment not found');
      expect((await dbAsg(a.id as string))?.endedAt).toBeNull();
    });

    it('returns 404 for a missing id and 400 for a bad id', async () => {
      const res = await api(
        'post',
        `/${'01970000-0000-7000-8000-00000000dead'}/end`,
      ).expect(404);
      expect((res.body as Body).message).toBe('Assignment not found');
      const bad = await api('post', '/abc/end').expect(400);
      expect((bad.body as Body).message).toBe(BAD_UUID);
    });

    it('frees the vehicle and driver for re-assignment', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const a = await assignOk(v.id, d.id);
      await api('post', `/${a.id as string}/end`).expect(200);
      const again = await assignOk(v.id, d.id);
      expect(again.id).not.toBe(a.id);
      expect(again.endedAt).toBeNull();
    });
  });

  describe('GET /assignments/:id', () => {
    it('returns the assignment', async () => {
      const a = await assignOk((await mkVehicle()).id, (await mkDriver()).id);
      const res = await api('get', `/${a.id as string}`).expect(200);
      expect(res.body).toEqual(a);
    });

    it('returns 404 for another org and 400 for a bad id', async () => {
      const a = await assignOk((await mkVehicle()).id, (await mkDriver()).id);
      const res = await api('get', `/${a.id as string}`, 'adminB').expect(404);
      expect((res.body as Body).message).toBe('Assignment not found');
      const bad = await api('get', `/${randomUUID()}`).expect(400);
      expect((bad.body as Body).message).toBe(BAD_UUID);
    });
  });

  describe('GET /assignments', () => {
    let vehicle: { id: string };
    let driver1: { id: string };
    let driver2: { id: string };
    let first: Body;
    let second: Body;

    beforeAll(async () => {
      vehicle = await mkVehicle();
      driver1 = await mkDriver();
      driver2 = await mkDriver();
      first = await assignOk(vehicle.id, driver1.id);
      await api('post', `/${first.id as string}/end`).expect(200);
      await new Promise((r) => setTimeout(r, 10));
      second = await assignOk(vehicle.id, driver2.id);
    });

    const list = async (qs: string, actor: Actor = 'admin') => {
      const res = await api('get', qs, actor).expect(200);
      return res.body as {
        data: Body[];
        meta: { page: number; limit: number; total: number };
      };
    };

    it('lists the vehicle history newest first', async () => {
      const body = await list(`?vehicleId=${vehicle.id}`);
      expect(body.data.map((a) => a.id)).toEqual([second.id, first.id]);
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 2 });
      expect(Object.keys(body.data[0]).sort()).toEqual(RESPONSE_KEYS);
    });

    it('filters active=true to the current assignment', async () => {
      const body = await list(`?vehicleId=${vehicle.id}&active=true`);
      expect(body.data.map((a) => a.id)).toEqual([second.id]);
      expect(body.meta.total).toBe(1);
    });

    it('filters active=false to ended assignments', async () => {
      const body = await list(`?vehicleId=${vehicle.id}&active=false`);
      expect(body.data.map((a) => a.id)).toEqual([first.id]);
      expect(body.data[0].endedAt).not.toBeNull();
    });

    it('filters by driverId', async () => {
      const body = await list(`?driverId=${driver1.id}`);
      expect(body.data.map((a) => a.id)).toEqual([first.id]);
    });

    it('combines vehicleId and driverId', async () => {
      const body = await list(
        `?vehicleId=${vehicle.id}&driverId=${driver2.id}`,
      );
      expect(body.data.map((a) => a.id)).toEqual([second.id]);
    });

    it('paginates with the total unchanged', async () => {
      const p1 = await list(`?vehicleId=${vehicle.id}&limit=1&page=1`);
      const p2 = await list(`?vehicleId=${vehicle.id}&limit=1&page=2`);
      const p3 = await list(`?vehicleId=${vehicle.id}&limit=1&page=3`);
      expect(p1.data.map((a) => a.id)).toEqual([second.id]);
      expect(p2.data.map((a) => a.id)).toEqual([first.id]);
      expect(p3.data).toEqual([]);
      expect(p3.meta).toEqual({ page: 3, limit: 1, total: 2 });
    });

    it('returns an empty list for an unknown vehicle', async () => {
      const body = await list(
        `?vehicleId=${'01970000-0000-7000-8000-00000000beef'}`,
      );
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('returns empty for org A ids queried from org B', async () => {
      const byVehicle = await list(`?vehicleId=${vehicle.id}`, 'adminB');
      const byDriver = await list(`?driverId=${driver1.id}`, 'adminB');
      expect(byVehicle.data).toEqual([]);
      expect(byVehicle.meta.total).toBe(0);
      expect(byDriver.data).toEqual([]);
    });

    it('never includes other-org assignments in an unfiltered list', async () => {
      const bAsg = await assign(
        (await mkVehicle(orgBId)).id,
        (await mkDriver(orgBId)).id,
        'adminB',
      ).expect(201);
      const body = await list('?limit=100');
      const ids = body.data.map((a) => a.id);
      expect(ids).not.toContain((bAsg.body as Body).id);
      expect(ids).toContain(second.id);
    });

    it.each([
      'active=yes',
      'active=1',
      'active=',
      'active=TRUE',
      'vehicleId=nope',
      `driverId=${randomUUID()}`,
      'page=0',
      'limit=101',
      'foo=bar',
    ])('returns 400 for ?%s', async (qs) => {
      await api('get', `?${qs}`).expect(400);
    });
  });

  describe('concurrency and database constraints', () => {
    it('two concurrent assignments of one vehicle yield exactly one 201 and one 409 with the vehicle message', async () => {
      const v = await mkVehicle();
      const d1 = await mkDriver();
      const d2 = await mkDriver();
      const results = await Promise.all([
        assign(v.id, d1.id),
        assign(v.id, d2.id),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const conflict = results.find((r) => r.status === 409);
      expect((conflict?.body as Body).message).toBe(VEHICLE_BUSY);
      expect(
        await prisma.vehicleAssignment.count({
          where: { vehicleId: v.id, endedAt: null },
        }),
      ).toBe(1);
    });

    it('two concurrent assignments of one driver yield exactly one 201 and one 409 with the driver message', async () => {
      const d = await mkDriver();
      const v1 = await mkVehicle();
      const v2 = await mkVehicle();
      const results = await Promise.all([
        assign(v1.id, d.id),
        assign(v2.id, d.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const conflict = results.find((r) => r.status === 409);
      expect((conflict?.body as Body).message).toBe(DRIVER_BUSY);
    });

    it('the database rejects a second active row for the same vehicle (P2002)', async () => {
      const v = await mkVehicle();
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: orgAId,
          vehicleId: v.id,
          driverId: (await mkDriver()).id,
          startedAt: new Date(),
        },
      });
      await expect(
        prisma.vehicleAssignment.create({
          data: {
            organizationId: orgAId,
            vehicleId: v.id,
            driverId: (await mkDriver()).id,
            startedAt: new Date(),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('the database rejects a second active row for the same driver (P2002)', async () => {
      const d = await mkDriver();
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: orgAId,
          vehicleId: (await mkVehicle()).id,
          driverId: d.id,
          startedAt: new Date(),
        },
      });
      await expect(
        prisma.vehicleAssignment.create({
          data: {
            organizationId: orgAId,
            vehicleId: (await mkVehicle()).id,
            driverId: d.id,
            startedAt: new Date(),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows an ended row plus a new active row for the same vehicle and driver', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const t = Date.now();
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: orgAId,
          vehicleId: v.id,
          driverId: d.id,
          startedAt: new Date(t - 2000),
          endedAt: new Date(t - 1000),
        },
      });
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: orgAId,
          vehicleId: v.id,
          driverId: d.id,
          startedAt: new Date(t),
        },
      });
      expect(
        await prisma.vehicleAssignment.count({ where: { vehicleId: v.id } }),
      ).toBe(2);
    });

    it('allows many ended rows for one vehicle', async () => {
      const v = await mkVehicle();
      const d = await mkDriver();
      const t = Date.now();
      for (let i = 0; i < 3; i++) {
        await prisma.vehicleAssignment.create({
          data: {
            organizationId: orgAId,
            vehicleId: v.id,
            driverId: d.id,
            startedAt: new Date(t - 10_000 + i * 1000),
            endedAt: new Date(t - 9_500 + i * 1000),
          },
        });
      }
    });
  });

  describe('deleting vehicles with history', () => {
    it('DELETE /vehicles/:id returns 409 for an assigned vehicle and the row survives', async () => {
      const v = await mkVehicle();
      const a = await assignOk(v.id, (await mkDriver()).id);
      await api('post', `/${a.id as string}/end`).expect(200);
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${v.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(409);
      expect((res.body as Body).message).toBe(
        'Vehicle has related records and cannot be deleted',
      );
      expect(
        await prisma.vehicle.findUnique({ where: { id: v.id } }),
      ).not.toBeNull();
    });

    it('DELETE /vehicles/:id still returns 204 for a never-assigned vehicle', async () => {
      const v = await mkVehicle();
      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${v.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(204);
    });
  });
});
