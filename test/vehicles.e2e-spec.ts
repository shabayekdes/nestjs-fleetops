import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { maxVehicleYear } from '../src/vehicles/dto/vehicle-normalizers.js';

type Body = Record<string, unknown>;

const BASE = '/api/v1/vehicles';
const RESPONSE_KEYS = [
  'createdAt',
  'id',
  'licensePlate',
  'make',
  'model',
  'updatedAt',
  'vin',
  'year',
];
const NOT_FOUND = {
  statusCode: 404,
  message: 'Vehicle not found',
  error: 'Not Found',
};
const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';

describe('Vehicles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Veh-${suffix}-pass!`;
  const orgIds: string[] = [];
  let plateSeq = 0;

  const newVin = (): string =>
    randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17);
  const newPlate = (): string => `P${++plateSeq}-${suffix.toUpperCase()}`;

  const payload = (o: Body = {}): Body => ({
    make: 'Ford',
    model: 'Transit',
    year: 2024,
    vin: newVin(),
    licensePlate: newPlate(),
    ...o,
  });

  const tokens: Record<'a' | 'b' | 'c' | 'd', string> = {
    a: '',
    b: '',
    c: '',
    d: '',
  };
  const orgOf: Record<'a' | 'b' | 'c' | 'd', string> = {
    a: '',
    b: '',
    c: '',
    d: '',
  };

  const api = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    org: 'a' | 'b' | 'c' | 'd' | null = 'a',
  ) => {
    const req = request(app.getHttpServer())[method](`${BASE}${path}`);
    return org === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[org]}`);
  };

  const createVia = async (
    org: 'a' | 'b' | 'c' | 'd',
    o: Body = {},
  ): Promise<Body> => {
    const res = await api('post', '', org).send(payload(o)).expect(201);
    return res.body as Body;
  };

  const dbRow = (id: string) => prisma.vehicle.findUnique({ where: { id } });

  let missingId: string;
  let vehicleA: Body;
  let vehicleB: Body;

  // Org C seed
  const BASE_TIME = Date.UTC(2020, 0, 1);
  const MAKES = ['Ford', 'Toyota', 'Mazda'];
  const seed = Array.from({ length: 25 }, (_, i) => ({
    make: MAKES[i % 3],
    model: i % 2 === 0 ? 'Alpha' : 'Beta',
    year: 2020 + (i % 4),
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  let seededIds: string[] = []; // newest first

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await hash(password);
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      const slug = `veh-${key}-${suffix}`;
      const org = await prisma.organization.create({
        data: { name: `Veh ${key} ${suffix}`, slug },
      });
      orgIds.push(org.id);
      orgOf[key] = org.id;
      const email = `${key}-${suffix}@example.test`;
      await prisma.user.create({
        data: {
          organizationId: org.id,
          email,
          firstName: 'Test',
          lastName: 'User',
          passwordHash,
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ organizationSlug: slug, email, password })
        .expect(200);
      tokens[key] = (res.body as Body).accessToken as string;
    }

    const tmp = await createVia('a');
    missingId = tmp.id as string;
    await api('delete', `/${missingId}`).expect(204);

    vehicleA = await createVia('a');
    vehicleB = await createVia('b');

    await prisma.vehicle.createMany({
      data: seed.map((s, i) => ({
        organizationId: orgOf.c,
        ...s,
        vin: newVin(),
        licensePlate: `C${i}-${suffix.toUpperCase()}`,
      })),
    });
    const rows = await prisma.vehicle.findMany({
      where: { organizationId: orgOf.c },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    seededIds = rows.map((r) => r.id);

    const tie = new Date(Date.UTC(2021, 0, 1));
    await prisma.vehicle.createMany({
      data: [1, 2].map(() => ({
        organizationId: orgOf.d,
        make: 'Tie',
        model: 'Tie',
        year: 2021,
        vin: newVin(),
        createdAt: tie,
      })),
    });
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
    } finally {
      await app.close();
    }
  });

  describe('authentication', () => {
    const someId = randomUUID();
    it.each<['get' | 'post' | 'patch' | 'delete', string]>([
      ['get', ''],
      ['post', ''],
      ['get', `/${someId}`],
      ['patch', `/${someId}`],
      ['delete', `/${someId}`],
    ])('%s %s without a token returns 401', async (method, path) => {
      const res = await api(method, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
    });

    it('rejects a garbage token', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(401);
    });

    it('returns 401 (not 400) for an invalid body without a token', async () => {
      const res = await api('post', '', null).send({ nope: true });
      expect(res.status).toBe(401);
    });

    it('returns 401 (not 400) for a malformed id without a token', async () => {
      const res = await api('get', '/abc', null);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /vehicles', () => {
    it('creates a vehicle with exactly the response keys', async () => {
      const body = payload();
      const res = await api('post', '').send(body).expect(201);
      const out = res.body as Body;
      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
      expect(out.id).toMatch(UUID_V7_RE);
      expect(out).toMatchObject(body);
      const row = await dbRow(out.id as string);
      expect(row?.organizationId).toBe(orgOf.a);
    });

    it('normalizes trim and case', async () => {
      const vin = newVin();
      const plate = newPlate();
      const out = await createVia('a', {
        make: '  Ford  ',
        model: ' Transit ',
        vin: `  ${vin.toLowerCase()} `,
        licensePlate: `  ${plate.toLowerCase()} `,
      });
      expect(out).toMatchObject({
        make: 'Ford',
        model: 'Transit',
        vin,
        licensePlate: plate,
      });
    });

    it('stores a null plate when omitted and keeps the key', async () => {
      const body = payload();
      delete body.licensePlate;
      const out = (await api('post', '').send(body).expect(201)).body as Body;
      expect(out).toHaveProperty('licensePlate', null);
      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
    });

    it('allows two null plates in the same org', async () => {
      await createVia('a', { licensePlate: null });
      await createVia('a', { licensePlate: null });
    });

    it.each(['organizationId', 'id', 'createdAt'])(
      'rejects %s in the body with 400 and creates nothing',
      async (key) => {
        const before = await prisma.vehicle.count({
          where: { organizationId: orgOf.b },
        });
        const value = key === 'organizationId' ? orgOf.b : randomUUID();
        const res = await api('post', '').send(payload({ [key]: value }));
        expect(res.status).toBe(400);
        expect(
          await prisma.vehicle.count({ where: { organizationId: orgOf.b } }),
        ).toBe(before);
      },
    );

    describe('duplicates', () => {
      it('returns 409 for a duplicate VIN, incl. lowercase and padded', async () => {
        const v = await createVia('a');
        for (const vin of [
          v.vin as string,
          (v.vin as string).toLowerCase(),
          `  ${v.vin as string} `,
        ]) {
          const res = await api('post', '').send(payload({ vin }));
          expect(res.status).toBe(409);
          expect((res.body as Body).message).toBe(
            'A vehicle with this VIN already exists',
          );
        }
      });

      it('returns 409 for a duplicate plate, incl. case', async () => {
        const v = await createVia('a');
        for (const licensePlate of [
          v.licensePlate as string,
          (v.licensePlate as string).toLowerCase(),
        ]) {
          const res = await api('post', '').send(payload({ licensePlate }));
          expect(res.status).toBe(409);
          expect((res.body as Body).message).toBe(
            'A vehicle with this license plate already exists',
          );
        }
      });

      it('lets org A reuse org B VIN and plate', async () => {
        const out = await createVia('a', {
          vin: vehicleB.vin,
          licensePlate: vehicleB.licensePlate,
        });
        expect(out.vin).toBe(vehicleB.vin);
        expect(out.licensePlate).toBe(vehicleB.licensePlate);
      });
    });

    const nextYear = maxVehicleYear();
    it.each<[string, () => Body]>([
      ['VIN 16 chars', () => payload({ vin: newVin().slice(0, 16) })],
      ['VIN 18 chars', () => payload({ vin: newVin() + '1' })],
      ['VIN with I', () => payload({ vin: 'I' + newVin().slice(1) })],
      ['VIN with O', () => payload({ vin: 'O' + newVin().slice(1) })],
      ['VIN with Q', () => payload({ vin: 'Q' + newVin().slice(1) })],
      ['year 1899', () => payload({ year: 1899 })],
      ['year max+5', () => payload({ year: nextYear + 5 })],
      ['year as string', () => payload({ year: '2023' })],
      ['year float', () => payload({ year: 2023.5 })],
      ['year null', () => payload({ year: null })],
      ['plate empty', () => payload({ licensePlate: '' })],
      ['plate blank', () => payload({ licensePlate: '   ' })],
      ['make empty', () => payload({ make: '' })],
      ['unknown field', () => payload({ colour: 'red' })],
      ['empty body', () => ({})],
    ])('returns 400 (never 500) for %s', async (_n, body) => {
      const res = await api('post', '').send(body());
      expect(res.status).toBe(400);
    });
  });

  describe('GET /vehicles/:id', () => {
    it('returns the vehicle with exactly the response keys', async () => {
      const res = await api('get', `/${vehicleA.id as string}`).expect(200);
      expect(Object.keys(res.body as Body).sort()).toEqual(RESPONSE_KEYS);
      expect(res.body).toMatchObject({ id: vehicleA.id, vin: vehicleA.vin });
    });

    it('returns 404 for a missing valid UUIDv7', async () => {
      const res = await api('get', `/${missingId}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each([['abc'], [randomUUID()]])(
      'returns 400 for the invalid id %s',
      async (id) => {
        const res = await api('get', `/${id}`).expect(400);
        expect((res.body as Body).message).toBe(BAD_UUID);
      },
    );
  });

  describe('PATCH /vehicles/:id', () => {
    it('updates make', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ make: '  Renault ' })
        .expect(200);
      expect((res.body as Body).make).toBe('Renault');
      expect((await dbRow(v.id as string))?.make).toBe('Renault');
    });

    it('clears the plate with null', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ licensePlate: null })
        .expect(200);
      expect((res.body as Body).licensePlate).toBeNull();
      expect((await dbRow(v.id as string))?.licensePlate).toBeNull();
    });

    it('returns the row unchanged for {} incl. updatedAt', async () => {
      const v = await createVia('a');
      const before = await dbRow(v.id as string);
      const res = await api('patch', `/${v.id as string}`)
        .send({})
        .expect(200);
      expect(res.body).toEqual(v);
      const after = await dbRow(v.id as string);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it('accepts its own current VIN', async () => {
      const v = await createVia('a');
      await api('patch', `/${v.id as string}`)
        .send({ vin: v.vin })
        .expect(200);
    });

    it('returns 409 for another vehicle VIN (incl. lowercase) and plate', async () => {
      const v = await createVia('a');
      const other = await createVia('a');
      for (const vin of [
        other.vin as string,
        (other.vin as string).toLowerCase(),
      ]) {
        const res = await api('patch', `/${v.id as string}`).send({ vin });
        expect(res.status).toBe(409);
        expect((res.body as Body).message).toBe(
          'A vehicle with this VIN already exists',
        );
      }
      const res = await api('patch', `/${v.id as string}`).send({
        licensePlate: other.licensePlate,
      });
      expect(res.status).toBe(409);
      expect((res.body as Body).message).toBe(
        'A vehicle with this license plate already exists',
      );
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('patch', `/${missingId}`)
        .send({ make: 'X' })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each<[string, Body]>([
      ['make null', { make: null }],
      ['vin null', { vin: null }],
      ['year null', { year: null }],
      ['organizationId', { organizationId: randomUUID() }],
      ['unknown field', { colour: 'red' }],
    ])('returns 400 for %s', async (_n, body) => {
      const res = await api('patch', `/${vehicleA.id as string}`).send(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await api('patch', '/abc').send({ make: 'X' }).expect(400);
      expect((res.body as Body).message).toBe(BAD_UUID);
    });
  });

  describe('DELETE /vehicles/:id', () => {
    it('deletes with 204 and an empty body, then 404s', async () => {
      const v = await createVia('a');
      const res = await api('delete', `/${v.id as string}`).expect(204);
      expect(res.text).toBe('');
      await api('get', `/${v.id as string}`).expect(404);
      const again = await api('delete', `/${v.id as string}`).expect(404);
      expect(again.body).toEqual(NOT_FOUND);
    });

    it('returns 404 for a missing id', async () => {
      const res = await api('delete', `/${missingId}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await api('delete', '/abc').expect(400);
      expect((res.body as Body).message).toBe(BAD_UUID);
    });
  });

  describe('tenant isolation', () => {
    it('org A GET of org B vehicle equals the missing-id 404', async () => {
      const res = await api('get', `/${vehicleB.id as string}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('org A PATCH of org B vehicle is 404 and leaves the row unchanged', async () => {
      const before = await dbRow(vehicleB.id as string);
      const res = await api('patch', `/${vehicleB.id as string}`)
        .send({ make: 'Hacked', licensePlate: null })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      const after = await dbRow(vehicleB.id as string);
      expect(after?.make).toBe(before?.make);
      expect(after?.licensePlate).toBe(before?.licensePlate);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it('org A PATCH of org B vehicle with an org A VIN is 404, not 409', async () => {
      await api('patch', `/${vehicleB.id as string}`)
        .send({ vin: vehicleA.vin })
        .expect(404);
    });

    it('org A PATCH of org B vehicle with {} is 404 and leaves the row unchanged', async () => {
      const before = await dbRow(vehicleB.id as string);
      const res = await api('patch', `/${vehicleB.id as string}`)
        .send({})
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      const missing = await api('patch', `/${missingId}`).send({}).expect(404);
      expect(res.body).toEqual(missing.body);
      expect(await dbRow(vehicleB.id as string)).toEqual(before);
    });

    it('org A DELETE of org B vehicle is 404 and the row survives', async () => {
      await api('delete', `/${vehicleB.id as string}`).expect(404);
      expect(await dbRow(vehicleB.id as string)).not.toBeNull();
    });

    it('org A list never contains org B vehicles', async () => {
      const res = await api(
        'get',
        `?make=${encodeURIComponent(vehicleB.make as string)}&limit=100`,
      ).expect(200);
      const data = (res.body as { data: Body[] }).data;
      const ids = data.map((d) => d.id);
      expect(ids).not.toContain(vehicleB.id);
      const rows = await prisma.vehicle.findMany({
        where: { id: { in: ids as string[] } },
      });
      expect(rows.every((r) => r.organizationId === orgOf.a)).toBe(true);
    });

    it('filters only org B matches yield total 0 for org A', async () => {
      const make = `OnlyB${suffix}`;
      await prisma.vehicle.update({
        where: { id: vehicleB.id as string },
        data: { make },
      });
      const res = await api('get', `?make=${make}`).expect(200);
      expect((res.body as { meta: Body }).meta.total).toBe(0);
      expect((res.body as { data: Body[] }).data).toEqual([]);
    });

    it('org B still reads its own vehicle', async () => {
      await api('get', `/${vehicleB.id as string}`, 'b').expect(200);
    });

    it('rejects ?organizationId= with 400', async () => {
      await api('get', `?organizationId=${orgOf.b}`).expect(400);
    });
  });

  describe('GET /vehicles (list, org C)', () => {
    const list = async (qs = '', org: 'a' | 'c' | 'd' = 'c') =>
      (await api('get', qs, org).expect(200)).body as {
        data: Body[];
        meta: { page: number; limit: number; total: number };
      };
    const ids = (r: { data: Body[] }): string[] =>
      r.data.map((d) => d.id as string);

    it('returns defaults', async () => {
      const r = await list();
      expect(r.meta).toEqual({ page: 1, limit: 20, total: 25 });
      expect(r.data).toHaveLength(20);
      for (const row of r.data) {
        expect(Object.keys(row).sort()).toEqual(RESPONSE_KEYS);
      }
    });

    it('paginates without overlap and covers all rows', async () => {
      const p1 = await list();
      const p2 = await list('?page=2');
      expect(p2.data).toHaveLength(5);
      expect(p2.meta).toEqual({ page: 2, limit: 20, total: 25 });
      const union = new Set([...ids(p1), ...ids(p2)]);
      expect(union.size).toBe(25);
      expect([...union].sort()).toEqual([...seededIds].sort());
    });

    it('returns an empty page beyond the end', async () => {
      const r = await list('?page=3');
      expect(r.data).toEqual([]);
      expect(r.meta.total).toBe(25);
    });

    it('honours limit with page 3', async () => {
      const r = await list('?limit=10&page=3');
      expect(r.data).toHaveLength(5);
      expect(r.meta).toEqual({ page: 3, limit: 10, total: 25 });
    });

    it('orders newest first by seeded createdAt', async () => {
      const r = await list('?limit=100');
      expect(ids(r)).toEqual(seededIds);
      const times = r.data.map((d) =>
        new Date(d.createdAt as string).getTime(),
      );
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('breaks createdAt ties by id descending', async () => {
      const r = await list('', 'd');
      expect(r.meta.total).toBe(2);
      const got = ids(r);
      expect(got).toEqual([...got].sort().reverse());
    });

    const expectedIds = (pred: (s: (typeof seed)[number]) => boolean) =>
      seed
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => pred(s))
        .map(({ i }) => seededIds[seed.length - 1 - i])
        .reverse();

    it.each(['FORD', 'ford', '%20ford%20'])(
      'filters make=%s case-insensitively and trimmed',
      async (make) => {
        const r = await list(`?make=${make}&limit=100`);
        const expected = expectedIds((s) => s.make === 'Ford');
        expect(r.meta.total).toBe(expected.length);
        expect(ids(r)).toEqual(expected);
      },
    );

    it('uses exact (not prefix) make matching', async () => {
      expect((await list('?make=For')).meta.total).toBe(0);
    });

    it('filters by year, model, and make+year', async () => {
      const byYear = expectedIds((s) => s.year === 2021);
      expect(ids(await list('?year=2021&limit=100'))).toEqual(byYear);
      const byModel = expectedIds((s) => s.model === 'Beta');
      expect(ids(await list('?model=beta&limit=100'))).toEqual(byModel);
      const both = expectedIds((s) => s.make === 'Toyota' && s.year === 2021);
      const r = await list('?make=toyota&year=2021&limit=100');
      expect(ids(r)).toEqual(both);
      expect(r.meta.total).toBe(both.length);
    });

    it.each([
      'limit=0',
      'limit=101',
      'page=0',
      'page=abc',
      'page=1.5',
      'page=1&page=2',
      'year=abc',
      'make=',
      'foo=bar',
    ])('returns 400 for ?%s', async (qs) => {
      await api('get', `?${qs}`, 'c').expect(400);
    });
  });
});
