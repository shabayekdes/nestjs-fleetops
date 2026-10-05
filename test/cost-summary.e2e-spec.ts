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

const FORBIDDEN = { statusCode: 403, message: 'Forbidden' };
const UNAUTHORIZED = { statusCode: 401, message: 'Unauthorized' };
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';

// "Now" is computed once. Month helpers are relative to the current UTC month
// and only use past months (day 10 / 20 / 28), far from any boundary.
const NOW = new Date();
const monthOf = (offset: number): string =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
const dateIn = (offset: number, dayOfMonth: number): string =>
  `${monthOf(offset)}-${String(dayOfMonth).padStart(2, '0')}`;
const zeroMonth = (month: string) => ({
  month,
  maintenanceCost: '0.00',
  fuelCost: '0.00',
  fuelLiters: '0.000',
  totalCost: '0.00',
});

describe('Cost summary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Cost-${suffix}-passw0rd!`;
  const orgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let seq = 0;
  const tokens = {} as Record<Actor, string>;

  const url = (vehicleId: string, qs = ''): string =>
    `/api/v1/vehicles/${vehicleId}/cost-summary${qs}`;

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
        licensePlate: `C${++seq}-${suffix.toUpperCase()}`,
      },
    });

  const mkMaintenance = (
    organizationId: string,
    vehicleId: string,
    performedOn: string,
    cost: string,
  ) =>
    prisma.maintenanceRecord.create({
      data: {
        organizationId,
        vehicleId,
        type: 'OTHER',
        performedOn: new Date(`${performedOn}T00:00:00.000Z`),
        cost,
      },
    });

  const mkFuel = (
    organizationId: string,
    vehicleId: string,
    fueledOn: string,
    totalCost: string,
    liters: string,
  ) =>
    prisma.fuelLog.create({
      data: {
        organizationId,
        vehicleId,
        fueledOn: new Date(`${fueledOn}T00:00:00.000Z`),
        totalCost,
        liters,
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

    const slugA = `cost-a-${suffix}`;
    const slugB = `cost-b-${suffix}`;
    const orgA = await prisma.organization.create({
      data: { name: `Cost A ${suffix}`, slug: slugA },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Cost B ${suffix}`, slug: slugB },
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
    const route = url(randomUUID());

    it('returns 401 without a token', async () => {
      const res = await call('get', route, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it('returns 403 for DRIVER, even with a bad query', async () => {
      for (const qs of ['', '?from=bad']) {
        const res = await call('get', `${route}${qs}`, 'driver');
        expect(res.status).toBe(403);
        expect(res.body).toEqual(FORBIDDEN);
      }
    });

    it('allows MANAGER and ADMIN', async () => {
      const v = await mkVehicle();
      await call('get', url(v.id), 'manager').expect(200);
      await call('get', url(v.id), 'admin').expect(200);
    });
  });

  describe('GET /vehicles/:vehicleId/cost-summary', () => {
    let v: { id: string };

    beforeAll(async () => {
      v = await mkVehicle();
      const other = await mkVehicle();
      const vb = await mkVehicle(orgBId);

      // In range [M-3, M-1]
      await mkMaintenance(orgAId, v.id, dateIn(-3, 10), '0.10');
      await mkMaintenance(orgAId, v.id, dateIn(-3, 20), '0.20');
      await mkMaintenance(orgAId, v.id, dateIn(-1, 5), '100.50');
      await mkFuel(orgAId, v.id, dateIn(-3, 10), '80.10', '45.5');
      await mkFuel(orgAId, v.id, dateIn(-3, 10), '0.20', '0.001');
      await mkFuel(orgAId, v.id, dateIn(-1, 28), '10', '2.25');
      // Outside the range (month before) - must be excluded
      await mkMaintenance(orgAId, v.id, dateIn(-4, 15), '999.00');
      await mkFuel(orgAId, v.id, dateIn(-4, 15), '999.00', '999');
      // Other vehicle in the same org, and a vehicle in org B - never counted
      await mkMaintenance(orgAId, other.id, dateIn(-3, 10), '5000');
      await mkFuel(orgAId, other.id, dateIn(-2, 10), '5000', '500');
      await mkMaintenance(orgBId, vb.id, dateIn(-3, 10), '7000');
      await mkFuel(orgBId, vb.id, dateIn(-2, 10), '7000', '700');
    });

    it('returns exact, zero-filled months and totals for an explicit range', async () => {
      const res = await call(
        'get',
        url(v.id, `?from=${monthOf(-3)}&to=${monthOf(-1)}`),
      ).expect(200);
      expect(res.body).toEqual({
        from: monthOf(-3),
        to: monthOf(-1),
        months: [
          {
            month: monthOf(-3),
            maintenanceCost: '0.30',
            fuelCost: '80.30',
            fuelLiters: '45.501',
            totalCost: '80.60',
          },
          zeroMonth(monthOf(-2)),
          {
            month: monthOf(-1),
            maintenanceCost: '100.50',
            fuelCost: '10.00',
            fuelLiters: '2.250',
            totalCost: '110.50',
          },
        ],
        totals: {
          maintenanceCost: '100.80',
          fuelCost: '90.30',
          fuelLiters: '47.751',
          totalCost: '191.10',
        },
      });
    });

    it('excludes the record just outside the range and includes it when widened', async () => {
      const narrow = (
        await call(
          'get',
          url(v.id, `?from=${monthOf(-3)}&to=${monthOf(-3)}`),
        ).expect(200)
      ).body as { totals: Body };
      expect(narrow.totals.maintenanceCost).toBe('0.30');
      const wide = (
        await call(
          'get',
          url(v.id, `?from=${monthOf(-4)}&to=${monthOf(-3)}`),
        ).expect(200)
      ).body as { totals: Body; months: Body[] };
      expect(wide.months[0]).toMatchObject({
        month: monthOf(-4),
        maintenanceCost: '999.00',
        fuelCost: '999.00',
        fuelLiters: '999.000',
        totalCost: '1998.00',
      });
      expect(wide.totals.maintenanceCost).toBe('999.30');
    });

    it('supports a single month (from == to)', async () => {
      const res = await call(
        'get',
        url(v.id, `?from=${monthOf(-1)}&to=${monthOf(-1)}`),
      ).expect(200);
      expect((res.body as { months: Body[] }).months).toHaveLength(1);
    });

    it('defaults to 12 months ending at the current UTC month', async () => {
      const res = await call('get', url(v.id)).expect(200);
      const body = res.body as {
        from: string;
        to: string;
        months: Body[];
        totals: Body;
      };
      expect(body.to).toBe(monthOf(0));
      expect(body.from).toBe(monthOf(-11));
      expect(body.months).toHaveLength(12);
      expect(body.months.map((m) => m.month)).toEqual(
        Array.from({ length: 12 }, (_, i) => monthOf(i - 11)),
      );
      const m3 = body.months.find((m) => m.month === monthOf(-3));
      expect(m3).toMatchObject({ maintenanceCost: '0.30', fuelCost: '80.30' });
      // 999.00 rows sit in M-4, inside the default window
      expect(body.months.find((m) => m.month === monthOf(-4))).toMatchObject({
        maintenanceCost: '999.00',
      });
    });

    it('anchors the default from at a given to', async () => {
      const res = await call('get', url(v.id, `?to=${monthOf(-3)}`)).expect(
        200,
      );
      const body = res.body as { from: string; months: Body[] };
      expect(body.from).toBe(monthOf(-14));
      expect(body.months).toHaveLength(12);
    });

    it('accepts 24 months and rejects 25', async () => {
      const ok = await call(
        'get',
        url(v.id, `?from=${monthOf(-23)}&to=${monthOf(0)}`),
      ).expect(200);
      expect((ok.body as { months: unknown[] }).months).toHaveLength(24);
      const res = await call(
        'get',
        url(v.id, `?from=${monthOf(-24)}&to=${monthOf(0)}`),
      ).expect(400);
      expect((res.body as Body).message).toBe(
        'The range must not exceed 24 months',
      );
    });

    it('rejects months beyond the year cap with 400, not 500', async () => {
      await call('get', url(v.id, '?to=9999-12')).expect(400);
      await call('get', url(v.id, '?from=9999-01&to=9999-12')).expect(400);
    });

    it('rejects from after to with 400', async () => {
      const res = await call(
        'get',
        url(v.id, `?from=${monthOf(-1)}&to=${monthOf(-3)}`),
      ).expect(400);
      expect((res.body as Body).message).toBe('from must not be after to');
    });

    it.each(['2026-13', '2026-1', '1899-12', '2026-01-01', 'abc', ''])(
      'rejects bad month %j for from and to',
      async (bad) => {
        await call('get', url(v.id, `?from=${bad}`)).expect(400);
        await call('get', url(v.id, `?to=${bad}`)).expect(400);
      },
    );

    it('rejects unknown query keys', async () => {
      await call('get', url(v.id, '?page=1')).expect(400);
    });

    it('returns 404 Vehicle not found for an org B vehicle', async () => {
      const vb = await mkVehicle(orgBId);
      const res = await call('get', url(vb.id)).expect(404);
      expect((res.body as Body).message).toBe('Vehicle not found');
    });

    it('returns 404 for a missing vehicle and 400 for a bad id', async () => {
      const gone = await mkVehicle();
      await prisma.vehicle.delete({ where: { id: gone.id } });
      await call('get', url(gone.id)).expect(404);
      const res = await call('get', url('abc')).expect(400);
      expect((res.body as Body).message).toBe(BAD_UUID);
    });

    it('org B sees only its own vehicle totals', async () => {
      const vb = await mkVehicle(orgBId);
      await mkMaintenance(orgBId, vb.id, dateIn(-2, 10), '12.34');
      const res = await call(
        'get',
        url(vb.id, `?from=${monthOf(-2)}&to=${monthOf(-2)}`),
        'adminB',
      ).expect(200);
      expect((res.body as { totals: Body }).totals).toEqual({
        maintenanceCost: '12.34',
        fuelCost: '0.00',
        fuelLiters: '0.000',
        totalCost: '12.34',
      });
      await call('get', url(vb.id), 'admin').expect(404);
    });

    it('returns all zeros for a vehicle with no records', async () => {
      const empty = await mkVehicle();
      const res = await call('get', url(empty.id)).expect(200);
      const body = res.body as { months: Body[]; totals: Body };
      expect(body.months).toHaveLength(12);
      expect(body.months.every((m) => m.totalCost === '0.00')).toBe(true);
      expect(body.totals).toEqual({
        maintenanceCost: '0.00',
        fuelCost: '0.00',
        fuelLiters: '0.000',
        totalCost: '0.00',
      });
    });
  });
});
