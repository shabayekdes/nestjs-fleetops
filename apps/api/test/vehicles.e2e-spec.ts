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
import { errorBody, stableError } from './utils/error-body.js';
import {
  createTestCatalog,
  type TestCatalog,
} from './utils/vehicle-catalog.js';

type Body = Record<string, unknown>;

const BASE = '/api/v1/vehicles';
const RESPONSE_KEYS = [
  'createdAt',
  'id',
  'licensePlate',
  'make',
  'model',
  'nextServiceDueOn',
  'serviceStatus',
  'updatedAt',
  'vehicleType',
  'vin',
  'year',
];
const REF_KEYS = ['id', 'name'];
// Valid UUIDv7 that no catalog row has.
const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const IDS = ['makeId', 'modelId', 'vehicleTypeId'] as const;
const NOT_FOUND = errorBody(404, 'Vehicle not found');
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
  let catalog: TestCatalog; // shared, read-only (never retired or mutated)
  let cat2: TestCatalog; // used by org C/D seed and as a second make/type
  const extraCatalogs: TestCatalog[] = [];

  const newVin = (): string =>
    randomUUID().replace(/-/g, '').toUpperCase().slice(0, 17);
  const newPlate = (): string => `P${++plateSeq}-${suffix.toUpperCase()}`;

  const refs = (c: TestCatalog = catalog): Body => ({
    makeId: c.makeA.id,
    modelId: c.modelA1.id,
    vehicleTypeId: c.type.id,
  });

  const payload = (o: Body = {}): Body => ({
    ...refs(),
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

  const roleTokens: Record<'MANAGER' | 'DRIVER', string> = {
    MANAGER: '',
    DRIVER: '',
  };

  const asRole = (
    role: 'MANAGER' | 'DRIVER',
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`${BASE}${path}`)
      .set('Authorization', `Bearer ${roleTokens[role]}`);

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

  const vehicleCount = () =>
    prisma.vehicle.count({ where: { organizationId: orgOf.a } });

  const dbRow = (id: string) => prisma.vehicle.findUnique({ where: { id } });

  const expectRefs = (out: Body, c: TestCatalog = catalog): void => {
    for (const key of ['make', 'model', 'vehicleType']) {
      expect(Object.keys(out[key] as Body).sort()).toEqual(REF_KEYS);
    }
    expect(out.make).toEqual(c.makeA);
    expect(out.model).toEqual(c.modelA1);
    expect(out.vehicleType).toEqual(c.type);
  };

  let missingId: string;
  let vehicleA: Body;
  let vehicleB: Body;

  // Org C seed: (make, model) combos cycle A/A1, A/A2, B/B1; types alternate.
  const BASE_TIME = Date.UTC(2020, 0, 1);
  type SeedRow = {
    makeId: string;
    modelId: string;
    vehicleTypeId: string;
    year: number;
    createdAt: Date;
  };
  let seed: SeedRow[] = [];
  let seededIds: string[] = []; // newest first

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    catalog = await createTestCatalog(prisma, suffix, { withRetired: true });
    cat2 = await createTestCatalog(prisma, `${suffix}2`);

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
          role: 'ADMIN',
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ organizationSlug: slug, email, password })
        .expect(200);
      tokens[key] = (res.body as Body).accessToken as string;
    }

    for (const role of ['MANAGER', 'DRIVER'] as const) {
      const email = `${role.toLowerCase()}-${suffix}@example.test`;
      await prisma.user.create({
        data: {
          organizationId: orgOf.a,
          email,
          firstName: 'Test',
          lastName: role,
          passwordHash,
          role,
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ organizationSlug: `veh-a-${suffix}`, email, password })
        .expect(200);
      roleTokens[role] = (res.body as Body).accessToken as string;
    }

    const tmp = await createVia('a');
    missingId = tmp.id as string;
    await api('delete', `/${missingId}`).expect(204);

    vehicleA = await createVia('a');
    vehicleB = await createVia('b');

    const combos = [
      [catalog.makeA.id, catalog.modelA1.id],
      [catalog.makeA.id, catalog.modelA2.id],
      [catalog.makeB.id, catalog.modelB1.id],
    ];
    seed = Array.from({ length: 25 }, (_, i) => ({
      makeId: combos[i % 3][0],
      modelId: combos[i % 3][1],
      vehicleTypeId: i % 2 === 0 ? catalog.type.id : cat2.type.id,
      year: 2020 + (i % 4),
      createdAt: new Date(BASE_TIME + i * 1000),
    }));
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
        makeId: catalog.makeA.id,
        modelId: catalog.modelA1.id,
        vehicleTypeId: catalog.type.id,
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
      for (const c of [...extraCatalogs, cat2, catalog]) await c.cleanup();
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
      expect(res.body).toEqual(errorBody(401, 'Unauthorized'));
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
      expectRefs(out);
      expect(out.id).toMatch(UUID_V7_RE);
      expect(out).toMatchObject({
        year: body.year,
        vin: body.vin,
        licensePlate: body.licensePlate,
      });
      const row = await dbRow(out.id as string);
      expect(row?.organizationId).toBe(orgOf.a);
    });

    it('starts with serviceStatus UNKNOWN and nextServiceDueOn null', async () => {
      const out = (await api('post', '').send(payload()).expect(201))
        .body as Body;
      expect(out.serviceStatus).toBe('UNKNOWN');
      expect(out.nextServiceDueOn).toBeNull();
    });

    it('normalizes trim and case of vin and plate', async () => {
      const vin = newVin();
      const plate = newPlate();
      const out = await createVia('a', {
        vin: `  ${vin.toLowerCase()} `,
        licensePlate: `  ${plate.toLowerCase()} `,
      });
      expect(out).toMatchObject({ vin, licensePlate: plate });
    });

    it('stores the catalog ids and returns the catalog names', async () => {
      const out = await createVia('a', {
        makeId: catalog.makeB.id,
        modelId: catalog.modelB1.id,
      });
      expect(out.make).toEqual(catalog.makeB);
      expect(out.model).toEqual(catalog.modelB1);
      expect(out.vehicleType).toEqual(catalog.type);
      expect(await dbRow(out.id as string)).toMatchObject({
        makeId: catalog.makeB.id,
        modelId: catalog.modelB1.id,
        vehicleTypeId: catalog.type.id,
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
      [
        'legacy make and model',
        () => ({ ...payload(), make: 'Ford', model: 'X' }),
      ],
      [
        'legacy make and model instead of ids',
        () => {
          const b = payload();
          delete b.makeId;
          delete b.modelId;
          delete b.vehicleTypeId;
          return { ...b, make: 'Ford', model: 'Transit' };
        },
      ],
      [
        'invalid body with an unknown make',
        () => payload({ makeId: UNKNOWN_ID, modelId: 'abc', year: 1899 }),
      ],
      ['unknown field', () => payload({ colour: 'red' })],
      ['serviceStatus', () => payload({ serviceStatus: 'OK' })],
      ['nextServiceDueOn', () => payload({ nextServiceDueOn: '2030-01-01' })],
      ['empty body', () => ({})],
    ])('returns 400 (never 500) for %s', async (_n, body) => {
      const res = await api('post', '').send(body());
      expect(res.status).toBe(400);
    });
  });

  describe('POST /vehicles catalog references', () => {
    describe('400 for bad ids', () => {
      const cases: [string, (key: string) => Body][] = [
        [
          'missing',
          (key) => {
            const b = payload();
            delete b[key];
            return b;
          },
        ],
        ['malformed', (key) => payload({ [key]: 'abc' })],
        ['a v4 uuid', (key) => payload({ [key]: randomUUID() })],
        ['null', (key) => payload({ [key]: null })],
        ['a number', (key) => payload({ [key]: 123 })],
        ['empty', (key) => payload({ [key]: '' })],
      ];
      for (const key of IDS) {
        it.each(cases)(`${key} %s returns 400, not 422`, async (_n, build) => {
          const before = await vehicleCount();
          const res = await api('post', '').send(build(key));
          expect(res.status).toBe(400);
          expect(await vehicleCount()).toBe(before);
        });
      }
    });

    describe('422 for invalid catalog references', () => {
      it.each<[string, () => Body, string]>([
        [
          'unknown make',
          () => payload({ makeId: UNKNOWN_ID }),
          'Vehicle make not found',
        ],
        [
          'unknown model',
          () => payload({ modelId: UNKNOWN_ID }),
          'Vehicle model not found for this make',
        ],
        [
          'unknown type',
          () => payload({ vehicleTypeId: UNKNOWN_ID }),
          'Vehicle type not found',
        ],
        [
          'model of another make',
          () => payload({ modelId: catalog.modelB1.id }),
          'Vehicle model not found for this make',
        ],
        [
          'retired make',
          () =>
            payload({
              makeId: catalog.retiredMake.id,
              modelId: catalog.modelOfRetiredMake.id,
            }),
          'Vehicle make is retired',
        ],
        [
          'retired model under an active make',
          () => payload({ modelId: catalog.retiredModel.id }),
          'Vehicle model is retired',
        ],
        [
          'active model under a retired make',
          () =>
            payload({
              makeId: catalog.retiredMake.id,
              modelId: catalog.modelOfRetiredMake.id,
            }),
          'Vehicle make is retired',
        ],
        [
          'retired type',
          () => payload({ vehicleTypeId: catalog.retiredType.id }),
          'Vehicle type is retired',
        ],
        [
          'unknown make with an unknown model and type (make is reported first)',
          () =>
            payload({
              makeId: UNKNOWN_ID,
              modelId: UNKNOWN_ID,
              vehicleTypeId: UNKNOWN_ID,
            }),
          'Vehicle make not found',
        ],
        [
          'unknown model with a retired type (model is reported first)',
          () =>
            payload({
              modelId: UNKNOWN_ID,
              vehicleTypeId: catalog.retiredType.id,
            }),
          'Vehicle model not found for this make',
        ],
      ])('%s returns 422 and creates nothing', async (_n, build, message) => {
        const before = await vehicleCount();
        const res = await api('post', '').send(build());
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, message));
        expect(await vehicleCount()).toBe(before);
      });

      it('an active model whose make is retired is reported as a retired make', async () => {
        // The make is checked before the model, so a mismatched pair under a
        // retired make still reports the make.
        const res = await api('post', '').send(
          payload({
            makeId: catalog.retiredMake.id,
            modelId: catalog.modelA1.id,
          }),
        );
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, 'Vehicle make is retired'));
      });
    });

    describe('authorization comes before catalog checks', () => {
      it.each<[string, () => Body]>([
        ['unknown make', () => payload({ makeId: UNKNOWN_ID })],
        [
          'retired type',
          () => payload({ vehicleTypeId: catalog.retiredType.id }),
        ],
      ])('DRIVER with %s gets 403, not 422', async (_n, build) => {
        const before = await vehicleCount();
        const res = await asRole('DRIVER', 'post', '').send(build());
        expect(res.status).toBe(403);
        expect(res.body).toEqual(errorBody(403, 'Forbidden'));
        expect(await vehicleCount()).toBe(before);
      });

      it('no token with unknown refs gets 401, not 422', async () => {
        const res = await api('post', '', null).send(
          payload({ makeId: UNKNOWN_ID }),
        );
        expect(res.status).toBe(401);
      });
    });
  });

  describe('GET /vehicles/:id', () => {
    it('returns the vehicle with exactly the response keys', async () => {
      const res = await api('get', `/${vehicleA.id as string}`).expect(200);
      expect(Object.keys(res.body as Body).sort()).toEqual(RESPONSE_KEYS);
      expectRefs(res.body as Body);
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
    it('updates year', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ year: 2001 })
        .expect(200);
      expect((res.body as Body).year).toBe(2001);
      expect((await dbRow(v.id as string))?.year).toBe(2001);
    });

    it('changes the model within the same make', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ modelId: catalog.modelA2.id })
        .expect(200);
      const out = res.body as Body;
      expect(Object.keys(out).sort()).toEqual(RESPONSE_KEYS);
      expect(out.make).toEqual(catalog.makeA);
      expect(out.model).toEqual(catalog.modelA2);
      expect(out.vehicleType).toEqual(catalog.type);
      expect(await dbRow(v.id as string)).toMatchObject({
        makeId: catalog.makeA.id,
        modelId: catalog.modelA2.id,
      });
    });

    it('changes make and model together', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ makeId: catalog.makeB.id, modelId: catalog.modelB1.id })
        .expect(200);
      const out = res.body as Body;
      expect(out.make).toEqual(catalog.makeB);
      expect(out.model).toEqual(catalog.modelB1);
      expect(await dbRow(v.id as string)).toMatchObject({
        makeId: catalog.makeB.id,
        modelId: catalog.modelB1.id,
      });
    });

    it('changes the vehicle type', async () => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`)
        .send({ vehicleTypeId: cat2.type.id })
        .expect(200);
      expect((res.body as Body).vehicleType).toEqual(cat2.type);
      expect((await dbRow(v.id as string))?.vehicleTypeId).toBe(cat2.type.id);
    });

    it('returns 400 for makeId without modelId and changes nothing', async () => {
      const v = await createVia('a');
      const before = await dbRow(v.id as string);
      const res = await api('patch', `/${v.id as string}`).send({
        makeId: catalog.makeB.id,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify((res.body as Body).details)).toContain(
        'modelId is required when makeId is changed',
      );
      expect(await dbRow(v.id as string)).toEqual(before);
    });

    it('returns 422 for a modelId of another make without makeId', async () => {
      const v = await createVia('a');
      const before = await dbRow(v.id as string);
      const res = await api('patch', `/${v.id as string}`).send({
        modelId: catalog.modelB1.id,
      });
      expect(res.status).toBe(422);
      expect(res.body).toEqual(
        errorBody(422, 'Vehicle model not found for this make'),
      );
      expect(await dbRow(v.id as string)).toEqual(before);
    });

    it.each<[string, Body, string]>([
      [
        'unknown make',
        { makeId: UNKNOWN_ID, modelId: UNKNOWN_ID },
        'Vehicle make not found',
      ],
      ['unknown type', { vehicleTypeId: UNKNOWN_ID }, 'Vehicle type not found'],
      [
        'unknown model',
        { modelId: UNKNOWN_ID },
        'Vehicle model not found for this make',
      ],
    ])('returns 422 for %s', async (_n, body, message) => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`).send(body);
      expect(res.status).toBe(422);
      expect(res.body).toEqual(errorBody(422, message));
    });

    it('checks that the vehicle exists before the catalog (404, not 422)', async () => {
      const res = await api('patch', `/${missingId}`).send({
        makeId: UNKNOWN_ID,
        modelId: UNKNOWN_ID,
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    describe('retired catalog rows on an existing vehicle', () => {
      const setup = async (retire: {
        make?: boolean;
        model?: boolean;
        type?: boolean;
      }) => {
        const c = await createTestCatalog(
          prisma,
          `${suffix}p${extraCatalogs.length}`,
          { withRetired: true },
        );
        extraCatalogs.push(c);
        const v = await createVia('a', refs(c));
        if (retire.make) {
          await prisma.vehicleMake.update({
            where: { id: c.makeA.id },
            data: { active: false },
          });
        }
        if (retire.model) {
          await prisma.vehicleModel.update({
            where: { id: c.modelA1.id },
            data: { active: false },
          });
        }
        if (retire.type) {
          await prisma.vehicleType.update({
            where: { id: c.type.id },
            data: { active: false },
          });
        }
        const patch = (body: Body) =>
          api('patch', `/${v.id as string}`).send(body);
        return { c, v, patch };
      };

      it('still accepts an unrelated update and resending the same ids', async () => {
        const { c, v, patch } = await setup({
          make: true,
          model: true,
          type: true,
        });
        const year = await patch({ year: 2002 });
        expect(year.status).toBe(200);
        expect((year.body as Body).year).toBe(2002);
        const same = await patch(refs(c));
        expect(same.status).toBe(200);
        expect((same.body as Body).id).toBe(v.id);
        expect((same.body as Body).make).toEqual({ ...c.makeA });
        expect((same.body as Body).vehicleType).toEqual({ ...c.type });
      });

      it('accepts a type change while the make and model stay retired', async () => {
        const { c, patch } = await setup({
          make: true,
          model: true,
          type: true,
        });
        const res = await patch({ vehicleTypeId: cat2.type.id });
        expect(res.status).toBe(200);
        expect((res.body as Body).make).toEqual({ ...c.makeA });
      });

      it('rejects switching to another retired model (retired model)', async () => {
        const { c, patch } = await setup({ model: true });
        const res = await patch({ modelId: c.retiredModel.id });
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, 'Vehicle model is retired'));
      });

      it('rejects switching to another retired model when the make is retired too', async () => {
        const { c, patch } = await setup({ make: true, model: true });
        const res = await patch({ modelId: c.retiredModel.id });
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, 'Vehicle make is retired'));
      });

      it('rejects a model-only change under the retired make', async () => {
        const { c, v, patch } = await setup({ make: true, model: true });
        const before = await dbRow(v.id as string);
        const res = await patch({ modelId: c.modelA2.id });
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, 'Vehicle make is retired'));
        expect(await dbRow(v.id as string)).toEqual(before);
      });

      it('rejects setting the type to a retired type', async () => {
        const { c, patch } = await setup({});
        const res = await patch({ vehicleTypeId: c.retiredType.id });
        expect(res.status).toBe(422);
        expect(res.body).toEqual(errorBody(422, 'Vehicle type is retired'));
      });
    });

    it.each(IDS)('returns 400 for %s null', async (key) => {
      const v = await createVia('a');
      const res = await api('patch', `/${v.id as string}`).send({
        [key]: null,
      });
      expect(res.status).toBe(400);
    });

    it.each(IDS)('returns 400 for a malformed or v4 %s', async (key) => {
      const v = await createVia('a');
      for (const bad of ['abc', randomUUID()]) {
        const res = await api('patch', `/${v.id as string}`).send({
          modelId: catalog.modelA1.id,
          [key]: bad,
        });
        expect(res.status).toBe(400);
      }
    });

    it('returns 400 for legacy make and model', async () => {
      const v = await createVia('a');
      await api('patch', `/${v.id as string}`)
        .send({ make: 'Ford', model: 'Transit' })
        .expect(400);
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
        .send({ year: 2020 })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each<[string, Body]>([
      ['legacy make', { make: 'Ford' }],
      ['vin null', { vin: null }],
      ['year null', { year: null }],
      ['organizationId', { organizationId: randomUUID() }],
      ['unknown field', { colour: 'red' }],
      ['serviceStatus', { serviceStatus: 'OK' }],
      ['nextServiceDueOn', { nextServiceDueOn: '2030-01-01' }],
    ])('returns 400 for %s', async (_n, body) => {
      const res = await api('patch', `/${vehicleA.id as string}`).send(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await api('patch', '/abc').send({ year: 2020 }).expect(400);
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

  describe('role enforcement (org A)', () => {
    describe('DRIVER (read-only)', () => {
      it('GET /vehicles returns 200', async () => {
        const res = await asRole('DRIVER', 'get', '').expect(200);
        expect(Array.isArray((res.body as Body).data)).toBe(true);
      });

      it('GET /vehicles/:id returns 200', async () => {
        const res = await asRole(
          'DRIVER',
          'get',
          `/${vehicleA.id as string}`,
        ).expect(200);
        expect((res.body as Body).id).toBe(vehicleA.id);
      });

      it('POST returns 403 and creates nothing', async () => {
        const body = payload();
        const res = await asRole('DRIVER', 'post', '').send(body);
        expect(res.status).toBe(403);
        expect(res.body).toEqual(errorBody(403, 'Forbidden'));
        expect(
          await prisma.vehicle.findFirst({
            where: { vin: body.vin as string },
          }),
        ).toBeNull();
      });

      it('PATCH returns 403 and leaves the row unchanged', async () => {
        const created = await createVia('a');
        const before = await dbRow(created.id as string);
        await asRole('DRIVER', 'patch', `/${created.id as string}`)
          .send({ year: 2001 })
          .expect(403);
        expect(await dbRow(created.id as string)).toEqual(before);
      });

      it('DELETE returns 403 and the row survives', async () => {
        const created = await createVia('a');
        await asRole('DRIVER', 'delete', `/${created.id as string}`).expect(
          403,
        );
        expect(await dbRow(created.id as string)).not.toBeNull();
      });

      it('POST with an invalid body returns 403, not 400', async () => {
        await asRole('DRIVER', 'post', '').send({ makeId: 1 }).expect(403);
      });

      it('PATCH with a malformed id returns 403, not 400', async () => {
        await asRole('DRIVER', 'patch', '/not-a-uuid').send({}).expect(403);
      });

      it('DELETE with a malformed id returns 403, not 400', async () => {
        await asRole('DRIVER', 'delete', '/not-a-uuid').expect(403);
      });
    });

    describe('MANAGER', () => {
      it('can POST, PATCH and DELETE', async () => {
        const created = await asRole('MANAGER', 'post', '')
          .send(payload())
          .expect(201);
        const id = (created.body as Body).id as string;

        const patched = await asRole('MANAGER', 'patch', `/${id}`)
          .send({ year: 2003 })
          .expect(200);
        expect((patched.body as Body).year).toBe(2003);

        await asRole('MANAGER', 'delete', `/${id}`).expect(204);
        expect(await dbRow(id)).toBeNull();
      });

      it('can read', async () => {
        await asRole('MANAGER', 'get', '').expect(200);
        await asRole('MANAGER', 'get', `/${vehicleA.id as string}`).expect(200);
      });
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
        .send({ year: 2001, licensePlate: null })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      const after = await dbRow(vehicleB.id as string);
      expect(after?.year).toBe(before?.year);
      expect(after?.licensePlate).toBe(before?.licensePlate);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it('org A PATCH of org B vehicle with valid refs is 404 and leaves the row unchanged', async () => {
      const before = await dbRow(vehicleB.id as string);
      const res = await api('patch', `/${vehicleB.id as string}`).send({
        makeId: catalog.makeB.id,
        modelId: catalog.modelB1.id,
        vehicleTypeId: cat2.type.id,
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(await dbRow(vehicleB.id as string)).toEqual(before);
    });

    it.each<[string, () => Body]>([
      ['unknown refs', () => ({ makeId: UNKNOWN_ID, modelId: UNKNOWN_ID })],
      ['an unknown type', () => ({ vehicleTypeId: UNKNOWN_ID })],
      ['a retired type', () => ({ vehicleTypeId: catalog.retiredType.id })],
      [
        'a retired make',
        () => ({
          makeId: catalog.retiredMake.id,
          modelId: catalog.modelOfRetiredMake.id,
        }),
      ],
      ['a retired model', () => ({ modelId: catalog.retiredModel.id })],
    ])(
      'org A PATCH of org B vehicle with %s is 404, not 422',
      async (_n, build) => {
        const before = await dbRow(vehicleB.id as string);
        const res = await api('patch', `/${vehicleB.id as string}`).send(
          build(),
        );
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
        expect(await dbRow(vehicleB.id as string)).toEqual(before);
      },
    );

    it('orgs A and B can both use the same catalog ids', async () => {
      const a = await createVia('a');
      const b = await createVia('b');
      for (const out of [a, b]) expectRefs(out);
      const rows = await prisma.vehicle.findMany({
        where: { id: { in: [a.id as string, b.id as string] } },
      });
      expect(new Set(rows.map((r) => r.makeId))).toEqual(
        new Set([catalog.makeA.id]),
      );
      expect(new Set(rows.map((r) => r.organizationId))).toEqual(
        new Set([orgOf.a, orgOf.b]),
      );
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
      expect(stableError(res.body)).toEqual(stableError(missing.body));
      expect(await dbRow(vehicleB.id as string)).toEqual(before);
    });

    it('org A DELETE of org B vehicle is 404 and the row survives', async () => {
      await api('delete', `/${vehicleB.id as string}`).expect(404);
      expect(await dbRow(vehicleB.id as string)).not.toBeNull();
    });

    it('org A list never contains org B vehicles', async () => {
      const res = await api(
        'get',
        `?makeId=${catalog.makeA.id}&limit=100`,
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
      // cat2 is only ever used by org B (and org C/D seeds, never org A).
      await createVia('b', refs(cat2));
      const res = await api('get', `?makeId=${cat2.makeA.id}`).expect(200);
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

    it('filters by makeId', async () => {
      const expected = expectedIds((s) => s.makeId === catalog.makeA.id);
      const r = await list(`?makeId=${catalog.makeA.id}&limit=100`);
      expect(r.meta.total).toBe(expected.length);
      expect(ids(r)).toEqual(expected);
      for (const row of r.data) expect(row.make).toEqual(catalog.makeA);
    });

    it('filters by modelId', async () => {
      const expected = expectedIds((s) => s.modelId === catalog.modelA2.id);
      const r = await list(`?modelId=${catalog.modelA2.id}&limit=100`);
      expect(ids(r)).toEqual(expected);
      expect(r.meta.total).toBe(expected.length);
      for (const row of r.data) expect(row.model).toEqual(catalog.modelA2);
    });

    it('filters by vehicleTypeId', async () => {
      const expected = expectedIds((s) => s.vehicleTypeId === cat2.type.id);
      const r = await list(`?vehicleTypeId=${cat2.type.id}&limit=100`);
      expect(ids(r)).toEqual(expected);
      expect(r.meta.total).toBe(expected.length);
      for (const row of r.data) expect(row.vehicleType).toEqual(cat2.type);
    });

    it('combines makeId, modelId, vehicleTypeId and year', async () => {
      const combo = expectedIds(
        (s) =>
          s.makeId === catalog.makeA.id &&
          s.modelId === catalog.modelA1.id &&
          s.vehicleTypeId === catalog.type.id,
      );
      const r = await list(
        `?makeId=${catalog.makeA.id}&modelId=${catalog.modelA1.id}&vehicleTypeId=${catalog.type.id}&limit=100`,
      );
      expect(ids(r)).toEqual(combo);
      const withYear = expectedIds(
        (s) => s.makeId === catalog.makeB.id && s.year === 2021,
      );
      const r2 = await list(`?makeId=${catalog.makeB.id}&year=2021&limit=100`);
      expect(ids(r2)).toEqual(withYear);
      expect(r2.meta.total).toBe(withYear.length);
    });

    it('returns an empty list when the model does not belong to the make', async () => {
      const r = await list(
        `?makeId=${catalog.makeA.id}&modelId=${catalog.modelB1.id}`,
      );
      expect(r.data).toEqual([]);
      expect(r.meta.total).toBe(0);
    });

    it('still filters by a retired make', async () => {
      const c = await createTestCatalog(prisma, `${suffix}L`);
      extraCatalogs.push(c);
      const v = await createVia('c', refs(c));
      await prisma.vehicleMake.update({
        where: { id: c.makeA.id },
        data: { active: false },
      });
      const r = await list(`?makeId=${c.makeA.id}`);
      expect(ids(r)).toEqual([v.id]);
      expect(r.meta.total).toBe(1);
      await api('delete', `/${v.id as string}`, 'c').expect(204);
    });

    it.each(['makeId', 'modelId', 'vehicleTypeId'])(
      'returns 200 and total 0 for a valid unknown %s',
      async (key) => {
        const r = await list(`?${key}=${UNKNOWN_ID}`);
        expect(r.data).toEqual([]);
        expect(r.meta.total).toBe(0);
      },
    );

    it.each(['makeId', 'modelId', 'vehicleTypeId'])(
      'returns 400 for a malformed or v4 %s',
      async (key) => {
        await api('get', `?${key}=abc`, 'c').expect(400);
        await api('get', `?${key}=${randomUUID()}`, 'c').expect(400);
        await api('get', `?${key}=`, 'c').expect(400);
      },
    );

    it.each(['make=Ford', 'model=x', 'make=Ford&model=Transit'])(
      'returns 400 for the legacy filter ?%s',
      async (qs) => {
        await api('get', `?${qs}`, 'c').expect(400);
      },
    );

    it('filters by year', async () => {
      const byYear = expectedIds((s) => s.year === 2021);
      expect(ids(await list('?year=2021&limit=100'))).toEqual(byYear);
    });

    it.each([
      'limit=0',
      'limit=101',
      'page=0',
      'page=abc',
      'page=1.5',
      'page=1&page=2',
      'year=abc',
      'makeId=',
      'foo=bar',
    ])('returns 400 for ?%s', async (qs) => {
      await api('get', `?${qs}`, 'c').expect(400);
    });
  });
});
