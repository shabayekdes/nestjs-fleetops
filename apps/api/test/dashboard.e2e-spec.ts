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
type Actor = 'admin' | 'manager' | 'driver' | 'adminB' | 'adminC';
type ServiceStatus = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN';

const FLEET = '/api/v1/dashboard/fleet';
const ME = '/api/v1/dashboard/me';
const FORBIDDEN = errorBody(403, 'Forbidden');
const UNAUTHORIZED = errorBody(401, 'Unauthorized');

const MS_DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dates are fixed once in beforeAll, after making sure we are not close to a
// UTC midnight rollover (see waitForSafeClock).
let today: Date;
const dayOffset = (days: number): Date =>
  new Date(today.getTime() + days * MS_DAY);
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

async function waitForSafeClock(): Promise<void> {
  const now = Date.now();
  const sinceMidnight = now % MS_DAY;
  const untilMidnight = MS_DAY - sinceMidnight;
  if (untilMidnight < 60_000) await sleep(untilMidnight + 1_000);
  const n = new Date();
  today = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()),
  );
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let catalog: TestCatalog;

  const suffix = randomUUID().slice(0, 8);
  const password = `Dash-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let orgCId: string;
  let seq = 0;
  const tokens = {} as Record<Actor, string>;

  const get = (path: string, actor: Actor | null) => {
    const req = request(app.getHttpServer()).get(path);
    return actor === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[actor]}`);
  };

  const mkVehicle = (
    organizationId: string,
    serviceStatus: ServiceStatus = 'UNKNOWN',
  ) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        makeId: catalog.makeA.id,
        modelId: catalog.modelA1.id,
        vehicleTypeId: catalog.type.id,
        year: 2022,
        vin: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17),
        licensePlate: `D${++seq}-${suffix.toUpperCase()}`,
        serviceStatus,
      },
    });

  const mkDriver = (
    organizationId: string,
    expiryOffsetDays: number,
    userId: string | null = null,
  ) =>
    prisma.driver.create({
      data: {
        organizationId,
        userId,
        firstName: 'Dana',
        lastName: `Driver${seq}`,
        licenseNumber: `DL${++seq}-${suffix.toUpperCase()}`,
        licenseExpiresOn: dayOffset(expiryOffsetDays),
      },
    });

  const mkAssignment = (
    organizationId: string,
    vehicleId: string,
    driverId: string,
    ended: boolean,
  ) =>
    prisma.vehicleAssignment.create({
      data: {
        organizationId,
        vehicleId,
        driverId,
        startedAt: new Date(Date.now() - 3 * MS_DAY),
        endedAt: ended ? new Date(Date.now() - 2 * MS_DAY) : null,
      },
    });

  const mkUser = async (
    organizationId: string,
    role: 'ADMIN' | 'MANAGER' | 'DRIVER',
    tag: string,
  ) =>
    prisma.user.create({
      data: {
        organizationId,
        email: `${tag.toLowerCase()}-${++seq}-${suffix}@example.test`,
        firstName: 'Test',
        lastName: tag,
        passwordHash: await hash(password),
        role,
      },
    });

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
    const user = await mkUser(organizationId, role, actor);
    tokens[actor] = await login(slug, user.email);
    return user;
  };

  const slugs = {
    A: `dash-a-${suffix}`,
    B: `dash-b-${suffix}`,
    C: `dash-c-${suffix}`,
  };

  beforeAll(async () => {
    await waitForSafeClock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    catalog = await createTestCatalog(prisma, suffix);

    const [orgA, orgB, orgC] = await Promise.all(
      (['A', 'B', 'C'] as const).map((k) =>
        prisma.organization.create({
          data: { name: `Dash ${k} ${suffix}`, slug: slugs[k] },
        }),
      ),
    );
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgCId = orgC.id;
    orgIds.push(orgAId, orgBId, orgCId);

    await setupActor('admin', orgAId, slugs.A, 'ADMIN');
    await setupActor('manager', orgAId, slugs.A, 'MANAGER');
    await setupActor('driver', orgAId, slugs.A, 'DRIVER');
    await setupActor('adminB', orgBId, slugs.B, 'ADMIN');
    await setupActor('adminC', orgCId, slugs.C, 'ADMIN');

    // Org A: 8 vehicles, 4 drivers, 2 active + 2 ended assignments.
    const statuses: ServiceStatus[] = [
      'OK',
      'OK',
      'DUE_SOON',
      'OVERDUE',
      'OVERDUE',
      'OVERDUE',
      'UNKNOWN',
      'UNKNOWN',
    ];
    const vehicles = [];
    for (const s of statuses) vehicles.push(await mkVehicle(orgAId, s));
    const dExpired = await mkDriver(orgAId, -1);
    const dToday = await mkDriver(orgAId, 0);
    const dLimit = await mkDriver(orgAId, 30);
    const dValid = await mkDriver(orgAId, 31);
    await mkAssignment(orgAId, vehicles[0].id, dToday.id, false);
    await mkAssignment(orgAId, vehicles[1].id, dValid.id, false);
    await mkAssignment(orgAId, vehicles[2].id, dExpired.id, true);
    await mkAssignment(orgAId, vehicles[2].id, dLimit.id, true);

    // Org B noise (must never leak into org A numbers).
    for (const s of ['OK', 'OVERDUE', 'DUE_SOON'] as ServiceStatus[]) {
      await mkVehicle(orgBId, s);
    }
    const bv = await mkVehicle(orgBId);
    const bd = await mkDriver(orgBId, -10);
    await mkDriver(orgBId, 5);
    await mkAssignment(orgBId, bv.id, bd.id, false);
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
    it.each([FLEET, ME])('GET %s without a token returns 401', async (path) => {
      const res = await get(path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it('GET /dashboard/fleet returns 403 for DRIVER', async () => {
      const res = await get(FLEET, 'driver');
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it.each(['admin', 'manager'] as const)(
      'GET /dashboard/fleet returns 200 for %s',
      async (actor) => {
        await get(FLEET, actor).expect(200);
      },
    );
  });

  describe('GET /dashboard/fleet', () => {
    it('returns exact counts for org A, ignoring org B and ended assignments', async () => {
      const res = await get(FLEET, 'admin').expect(200);
      expect(res.body).toEqual({
        asOf: dateOnly(today),
        vehicles: {
          total: 8,
          serviceStatus: { OK: 2, DUE_SOON: 1, OVERDUE: 3, UNKNOWN: 2 },
        },
        drivers: {
          total: 4,
          licenseStatus: { VALID: 1, EXPIRING_SOON: 2, EXPIRED: 1 },
        },
        assignments: { active: 2 },
      });
    });

    it('returns the same numbers for MANAGER', async () => {
      const a = (await get(FLEET, 'admin').expect(200)).body as Body;
      const m = (await get(FLEET, 'manager').expect(200)).body as Body;
      expect(m).toEqual(a);
    });

    it('has exactly the documented keys', async () => {
      const body = (await get(FLEET, 'admin').expect(200)).body as {
        vehicles: { serviceStatus: Body };
        drivers: { licenseStatus: Body };
        assignments: Body;
      } & Body;
      expect(Object.keys(body).sort()).toEqual([
        'asOf',
        'assignments',
        'drivers',
        'vehicles',
      ]);
      expect(Object.keys(body.vehicles).sort()).toEqual([
        'serviceStatus',
        'total',
      ]);
      expect(Object.keys(body.vehicles.serviceStatus).sort()).toEqual([
        'DUE_SOON',
        'OK',
        'OVERDUE',
        'UNKNOWN',
      ]);
      expect(Object.keys(body.drivers).sort()).toEqual([
        'licenseStatus',
        'total',
      ]);
      expect(Object.keys(body.drivers.licenseStatus).sort()).toEqual([
        'EXPIRED',
        'EXPIRING_SOON',
        'VALID',
      ]);
      expect(Object.keys(body.assignments)).toEqual(['active']);
    });

    it('reports org B only its own data', async () => {
      const res = await get(FLEET, 'adminB').expect(200);
      expect(res.body).toMatchObject({
        vehicles: {
          total: 4,
          serviceStatus: { OK: 1, DUE_SOON: 1, OVERDUE: 1, UNKNOWN: 1 },
        },
        drivers: {
          total: 2,
          licenseStatus: { VALID: 0, EXPIRING_SOON: 1, EXPIRED: 1 },
        },
        assignments: { active: 1 },
      });
    });

    it('returns the exact zero-filled body for an empty org', async () => {
      const res = await get(FLEET, 'adminC').expect(200);
      expect(res.body).toEqual({
        asOf: dateOnly(today),
        vehicles: {
          total: 0,
          serviceStatus: { OK: 0, DUE_SOON: 0, OVERDUE: 0, UNKNOWN: 0 },
        },
        drivers: {
          total: 0,
          licenseStatus: { VALID: 0, EXPIRING_SOON: 0, EXPIRED: 0 },
        },
        assignments: { active: 0 },
      });
    });
  });

  describe('GET /dashboard/me', () => {
    it('returns the exact shape for a linked DRIVER with an active assignment', async () => {
      const user = await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      const driver = await mkDriver(orgBId, 10, user.id);
      const vehicle = await mkVehicle(orgBId);
      const assignment = await mkAssignment(
        orgBId,
        vehicle.id,
        driver.id,
        false,
      );

      const res = await get(ME, 'driver').expect(200);
      expect(res.body).toEqual({
        driver: {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          licenseNumber: driver.licenseNumber,
          licenseExpiresOn: dateOnly(dayOffset(10)),
          licenseStatus: 'EXPIRING_SOON',
        },
        currentAssignment: {
          id: assignment.id,
          startedAt: assignment.startedAt.toISOString(),
          vehicle: {
            id: vehicle.id,
            make: catalog.makeA.name,
            model: catalog.modelA1.name,
            licensePlate: vehicle.licensePlate,
          },
        },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(vehicle.vin);
      expect(text).not.toContain('organizationId');
      expect(text).not.toContain('userId');
    });

    it('returns currentAssignment null when only ended assignments exist', async () => {
      const user = await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      const driver = await mkDriver(orgBId, 100, user.id);
      const v1 = await mkVehicle(orgBId);
      const v2 = await mkVehicle(orgBId);
      await mkAssignment(orgBId, v1.id, driver.id, true);
      await mkAssignment(orgBId, v2.id, driver.id, true);

      const res = await get(ME, 'driver').expect(200);
      expect(res.body).toEqual({
        driver: {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          licenseNumber: driver.licenseNumber,
          licenseExpiresOn: dateOnly(dayOffset(100)),
          licenseStatus: 'VALID',
        },
        currentAssignment: null,
      });
    });

    it('reports an expired license for the linked driver', async () => {
      const user = await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      await mkDriver(orgBId, -1, user.id);
      const res = await get(ME, 'driver').expect(200);
      expect(res.body).toMatchObject({
        driver: { licenseStatus: 'EXPIRED' },
        currentAssignment: null,
      });
    });

    it('returns driver null for a user without a driver record', async () => {
      await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      const res = await get(ME, 'driver').expect(200);
      expect(res.body).toEqual({ driver: null, currentAssignment: null });
    });

    it.each(['admin', 'manager'] as const)(
      'returns 200 with nulls for an unlinked %s even though org drivers exist',
      async (actor) => {
        const res = await get(ME, actor).expect(200);
        expect(res.body).toEqual({ driver: null, currentAssignment: null });
      },
    );

    it('never shows another user driver record', async () => {
      // Two driver users in the same org; each only sees their own record.
      const u1 = await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      const d1 = await mkDriver(orgBId, 50, u1.id);
      const t1 = tokens.driver;
      const u2 = await setupActor('driver', orgBId, slugs.B, 'DRIVER');
      const d2 = await mkDriver(orgBId, 60, u2.id);
      const t2 = tokens.driver;

      const r1 = await request(app.getHttpServer())
        .get(ME)
        .set('Authorization', `Bearer ${t1}`)
        .expect(200);
      const r2 = await request(app.getHttpServer())
        .get(ME)
        .set('Authorization', `Bearer ${t2}`)
        .expect(200);
      expect((r1.body as { driver: Body }).driver.id).toBe(d1.id);
      expect((r2.body as { driver: Body }).driver.id).toBe(d2.id);
    });
  });
});
