import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import type { Collection } from 'mongodb';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  TELEMETRY_READINGS_COLLECTION,
  VEHICLE_LATEST_STATUS_COLLECTION,
} from '../src/telemetry/mongo/mongo.tokens.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from '../src/telemetry/mongo/telemetry-documents.js';
import { errorBody } from './utils/error-body.js';
import { describeWithMongo } from './utils/mongo-test-env.js';
import {
  createTestCatalog,
  type TestCatalog,
} from './utils/vehicle-catalog.js';

type Body = Record<string, unknown>;
type Role = 'ADMIN' | 'MANAGER' | 'DRIVER';
type Method = 'get' | 'post';

const BASE = '/api/v1/telemetry';
const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const NOT_FOUND = errorBody(404, 'Vehicle not found');
const READING_KEYS = [
  'engine',
  'fuelLevelPercent',
  'location',
  'odometerKm',
  'receivedAt',
  'speedKph',
  'timestamp',
  'vehicleId',
];
const MIN = 60_000;
const DAY = 86_400_000;

describeWithMongo('Telemetry API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let readings: Collection<TelemetryReadingDocument>;
  let latest: Collection<VehicleLatestStatusDocument>;
  let catalog: TestCatalog;

  const suffix = randomUUID().slice(0, 8);
  const password = `Tel-${suffix}-pass!`;
  const orgIds: string[] = [];
  const tokens: Record<
    'A_ADMIN' | 'A_MANAGER' | 'A_DRIVER' | 'B_ADMIN',
    string
  > = { A_ADMIN: '', A_MANAGER: '', A_DRIVER: '', B_ADMIN: '' };
  const orgOf = { a: '', b: '' };
  let vinSeq = 0;

  const call = (
    method: Method,
    path: string,
    token: keyof typeof tokens | null = 'A_ADMIN',
  ) => {
    const req = request(app.getHttpServer())[method](`${BASE}${path}`);
    return token === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[token]}`);
  };

  const newVehicle = async (org: 'a' | 'b'): Promise<string> => {
    const row = await prisma.vehicle.create({
      data: {
        organizationId: orgOf[org],
        makeId: catalog.makeA.id,
        modelId: catalog.modelA1.id,
        vehicleTypeId: catalog.type.id,
        year: 2024,
        vin: `T${suffix}${String(++vinSeq).padStart(8, '0')}`
          .toUpperCase()
          .slice(0, 17)
          .padEnd(17, 'X'),
      },
      select: { id: true },
    });
    return row.id;
  };

  const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

  const reading = (
    vehicleId: string,
    timestamp: string,
    over: Body = {},
  ): Body => ({
    vehicleId,
    timestamp,
    location: { latitude: 30, longitude: 31 },
    speedKph: 50,
    ...over,
  });

  const post = (
    path: string,
    body: unknown,
    token: keyof typeof tokens = 'A_ADMIN',
  ) => call('post', path, token).send(body as object);

  let vehicleA: string;
  let vehicleB: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    readings = app.get(TELEMETRY_READINGS_COLLECTION, { strict: false });
    latest = app.get(VEHICLE_LATEST_STATUS_COLLECTION, { strict: false });
    catalog = await createTestCatalog(prisma, `tel${suffix}`);

    const passwordHash = await hash(password);
    const specs: [keyof typeof tokens, 'a' | 'b', Role][] = [
      ['A_ADMIN', 'a', 'ADMIN'],
      ['A_MANAGER', 'a', 'MANAGER'],
      ['A_DRIVER', 'a', 'DRIVER'],
      ['B_ADMIN', 'b', 'ADMIN'],
    ];
    const slugs = { a: `tel-a-${suffix}`, b: `tel-b-${suffix}` };
    for (const key of ['a', 'b'] as const) {
      const org = await prisma.organization.create({
        data: { name: `Tel ${key} ${suffix}`, slug: slugs[key] },
      });
      orgIds.push(org.id);
      orgOf[key] = org.id;
    }
    for (const [token, org, role] of specs) {
      const email = `${token.toLowerCase()}-${suffix}@example.test`;
      await prisma.user.create({
        data: {
          organizationId: orgOf[org],
          email,
          firstName: 'Test',
          lastName: role,
          passwordHash,
          role,
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ organizationSlug: slugs[org], email, password })
        .expect(200);
      tokens[token] = (res.body as Body).accessToken as string;
    }
    vehicleA = await newVehicle('a');
    vehicleB = await newVehicle('b');
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (orgIds.length > 0) {
        await readings.deleteMany({ 'meta.organizationId': { $in: orgIds } });
        await latest.deleteMany({ organizationId: { $in: orgIds } });
        await prisma.vehicle.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.user.deleteMany({
          where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }
      await catalog?.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('authentication and authorization', () => {
    it.each<[Method, string]>([
      ['post', '/readings'],
      ['post', '/readings/batch'],
      ['get', '/latest'],
      ['get', '/latest/near?latitude=1&longitude=1'],
      ['get', `/vehicles/${UNKNOWN_ID}/readings`],
      ['get', `/vehicles/${UNKNOWN_ID}/latest`],
      ['get', `/vehicles/${UNKNOWN_ID}/daily`],
    ])('%s %s without a token returns 401', async (method, path) => {
      const res = await call(method, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(errorBody(401, 'Unauthorized'));
    });

    it('forbids DRIVER from ingesting (single and batch)', async () => {
      const single = await post(
        '/readings',
        reading(vehicleA, ago(MIN)),
        'A_DRIVER',
      );
      expect(single.status).toBe(403);
      const batch = await post(
        '/readings/batch',
        { readings: [reading(vehicleA, ago(MIN))] },
        'A_DRIVER',
      );
      expect(batch.status).toBe(403);
      expect(
        await readings.countDocuments({ 'meta.vehicleId': vehicleA }),
      ).toBe(0);
    });

    it('lets DRIVER read', async () => {
      await call('get', '/latest', 'A_DRIVER').expect(200);
      await call(
        'get',
        `/vehicles/${vehicleA}/readings?from=${encodeURIComponent(ago(DAY))}&to=${encodeURIComponent(ago(0))}`,
        'A_DRIVER',
      ).expect(200);
    });

    it('lets MANAGER ingest single (201) and batch (200)', async () => {
      const v = await newVehicle('a');
      await post('/readings', reading(v, ago(2 * MIN)), 'A_MANAGER').expect(
        201,
      );
      const batch = await post(
        '/readings/batch',
        { readings: [reading(v, ago(MIN))] },
        'A_MANAGER',
      ).expect(200);
      expect(batch.body).toEqual({ accepted: 1, rejected: [] });
    });
  });

  describe('POST /readings', () => {
    it('stores a reading and returns exactly the public keys', async () => {
      const v = await newVehicle('a');
      const ts = ago(MIN);
      const res = await post(
        '/readings',
        reading(v, ts, {
          fuelLevelPercent: 40.5,
          odometerKm: 1000,
          engine: { on: true, rpm: 1500 },
        }),
      ).expect(201);

      expect(Object.keys(res.body as Body).sort()).toEqual(READING_KEYS);
      expect(res.body).toMatchObject({
        vehicleId: v,
        timestamp: ts,
        location: { latitude: 30, longitude: 31 },
        speedKph: 50,
        fuelLevelPercent: 40.5,
        odometerKm: 1000,
        engine: { on: true, rpm: 1500, coolantTempC: null },
      });
      expect(JSON.stringify(res.body)).not.toContain(orgOf.a);
      const stored = await readings.findOne({ 'meta.vehicleId': v });
      expect(stored?.meta.organizationId).toBe(orgOf.a);
    });

    it('returns null for absent optionals', async () => {
      const v = await newVehicle('a');
      const res = await post('/readings', reading(v, ago(MIN))).expect(201);
      expect(res.body).toMatchObject({
        fuelLevelPercent: null,
        odometerKm: null,
        engine: null,
      });
    });

    it('accepts an uppercase vehicleId and stores it lowercase', async () => {
      const v = await newVehicle('a');
      const res = await post(
        '/readings',
        reading(v.toUpperCase(), ago(MIN)),
      ).expect(201);
      expect((res.body as Body).vehicleId).toBe(v);
    });

    it('rejects organizationId in the body with 400', async () => {
      const res = await post(
        '/readings',
        reading(vehicleA, ago(MIN), { organizationId: orgOf.b }),
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('organizationId');
    });

    it('rejects latitude 91 with a message naming location.latitude', async () => {
      const res = await post(
        '/readings',
        reading(vehicleA, ago(MIN), {
          location: { latitude: 91, longitude: 0 },
        }),
      );
      expect(res.status).toBe(400);
      expect(
        (res.body as { details: { field: string }[] }).details.map(
          (d) => d.field,
        ),
      ).toContain('location.latitude');
    });

    it('rejects a missing location with 400 (not 500)', async () => {
      const body = reading(vehicleA, ago(MIN));
      delete body.location;
      const res = await post('/readings', body);
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp 10 minutes in the future and one without an offset', async () => {
      const future = new Date(Date.now() + 10 * MIN).toISOString();
      await post('/readings', reading(vehicleA, future)).expect(400);
      await post('/readings', reading(vehicleA, '2026-10-01T10:00:00')).expect(
        400,
      );
    });

    it('rejects a non-v7 vehicleId with 400', async () => {
      await post(
        '/readings',
        reading('c9bf9e57-1685-4c89-bafb-ff5af830be8a', ago(MIN)),
      ).expect(400);
    });

    it('returns the same 404 for another organization vehicle and an unknown one', async () => {
      const other = await post('/readings', reading(vehicleB, ago(MIN)));
      const unknown = await post('/readings', reading(UNKNOWN_ID, ago(MIN)));
      expect(other.status).toBe(404);
      expect(other.body).toEqual(NOT_FOUND);
      expect(unknown.body).toEqual(NOT_FOUND);
      expect(
        await readings.countDocuments({ 'meta.vehicleId': vehicleB }),
      ).toBe(0);
    });

    it('returns 422 for a reading older than the retention period', async () => {
      const res = await post('/readings', reading(vehicleA, ago(40 * DAY)));
      expect(res.status).toBe(422);
      expect(res.body).toEqual(
        errorBody(422, 'Reading is older than the retention period'),
      );
    });

    it('reports 404 before 422 for a foreign vehicle with an old timestamp', async () => {
      const res = await post('/readings', reading(vehicleB, ago(40 * DAY)));
      expect(res.status).toBe(404);
    });
  });

  describe('POST /readings/batch', () => {
    it('reports per-reading outcomes with original indexes and stores only own readings', async () => {
      const [v1, v2] = [await newVehicle('a'), await newVehicle('a')];
      const old = ago(40 * DAY);
      const res = await post('/readings/batch', {
        readings: [
          reading(v1, ago(3 * MIN)),
          reading(vehicleB, ago(3 * MIN)),
          reading(UNKNOWN_ID, ago(3 * MIN)),
          reading(v2, old),
          reading(v2, ago(2 * MIN)),
        ],
      }).expect(200);

      expect(res.body).toEqual({
        accepted: 2,
        rejected: [
          { index: 1, vehicleId: vehicleB, reason: 'VEHICLE_NOT_FOUND' },
          { index: 2, vehicleId: UNKNOWN_ID, reason: 'VEHICLE_NOT_FOUND' },
          { index: 3, vehicleId: v2, reason: 'TOO_OLD' },
        ],
      });

      const own = await call(
        'get',
        `/vehicles/${vehicleB}/readings?from=${encodeURIComponent(ago(DAY))}&to=${encodeURIComponent(ago(0))}`,
        'B_ADMIN',
      ).expect(200);
      expect((own.body as { data: unknown[] }).data).toEqual([]);
      expect(await latest.countDocuments({ vehicleId: vehicleB })).toBe(0);
    });

    it('returns 200 with accepted 0 when everything is rejected', async () => {
      const res = await post('/readings/batch', {
        readings: [reading(vehicleB, ago(MIN)), reading(UNKNOWN_ID, ago(MIN))],
      }).expect(200);
      expect((res.body as Body).accepted).toBe(0);
      expect((res.body as { rejected: unknown[] }).rejected).toHaveLength(2);
    });

    it('rejects 201 readings and an empty batch with 400', async () => {
      const one = reading(vehicleA, ago(MIN));
      await post('/readings/batch', {
        readings: Array.from({ length: 201 }, () => one),
      }).expect(400);
      await post('/readings/batch', { readings: [] }).expect(400);
    });

    it('rejects the whole request when one reading is invalid (nested path)', async () => {
      const res = await post('/readings/batch', {
        readings: [
          reading(vehicleA, ago(MIN)),
          reading(vehicleA, ago(MIN), { speedKph: 999 }),
        ],
      });
      expect(res.status).toBe(400);
      expect(
        (res.body as { details: { field: string }[] }).details.map(
          (d) => d.field,
        ),
      ).toContain('readings.1.speedKph');
      expect(
        await readings.countDocuments({
          'meta.vehicleId': vehicleA,
          speedKph: 999,
        }),
      ).toBe(0);
    });

    it('accepts exactly 200 readings', async () => {
      const v = await newVehicle('a');
      const base = Date.now() - 10 * MIN;
      const res = await post('/readings/batch', {
        readings: Array.from({ length: 200 }, (_, i) =>
          reading(v, new Date(base + i * 1000).toISOString()),
        ),
      }).expect(200);
      expect(res.body).toEqual({ accepted: 200, rejected: [] });
    });

    it('ends with the newest reading as latest per vehicle', async () => {
      const [v1, v2] = [await newVehicle('a'), await newVehicle('a')];
      const t = Date.now() - 20 * MIN;
      const newest1 = new Date(t + 5 * MIN).toISOString();
      const newest2 = new Date(t + 4 * MIN).toISOString();
      await post('/readings/batch', {
        readings: [
          reading(v1, new Date(t + 2 * MIN).toISOString(), { speedKph: 20 }),
          reading(v2, newest2, { speedKph: 22 }),
          reading(v1, newest1, { speedKph: 21 }),
          reading(v1, new Date(t).toISOString(), { speedKph: 19 }),
          reading(v2, new Date(t + MIN).toISOString(), { speedKph: 23 }),
        ],
      }).expect(200);

      const l1 = await call('get', `/vehicles/${v1}/latest`).expect(200);
      const l2 = await call('get', `/vehicles/${v2}/latest`).expect(200);
      expect(l1.body).toMatchObject({ timestamp: newest1, speedKph: 21 });
      expect(l2.body).toMatchObject({ timestamp: newest2, speedKph: 22 });
    });
  });

  describe('GET /vehicles/:id/readings', () => {
    const window = (from: string, to: string) =>
      `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    it('returns newest first and pages through every reading exactly once', async () => {
      const v = await newVehicle('a');
      const base = Date.now() - 60 * MIN;
      const stamps = Array.from({ length: 7 }, (_, i) =>
        new Date(base + i * MIN).toISOString(),
      );
      await post('/readings/batch', {
        readings: [...stamps].reverse().map((t) => reading(v, t)),
      }).expect(200);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const qs: string = `${window(ago(2 * 60 * MIN), ago(0))}&limit=3${
          cursor ? `&before=${encodeURIComponent(cursor)}` : ''
        }`;
        const res = await call('get', `/vehicles/${v}/readings?${qs}`).expect(
          200,
        );
        const body = res.body as {
          data: { timestamp: string }[];
          meta: { limit: number; nextCursor: string | null };
        };
        expect(body.meta.limit).toBe(3);
        seen.push(...body.data.map((d) => d.timestamp));
        cursor = body.meta.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(seen).toEqual([...stamps].reverse());
      expect(cursor).toBeNull();
    });

    it('includes a reading exactly at from and at to', async () => {
      const v = await newVehicle('a');
      const from = new Date(Date.now() - 30 * MIN);
      const to = new Date(from.getTime() + 10 * MIN);
      await post('/readings/batch', {
        readings: [
          reading(v, from.toISOString()),
          reading(v, to.toISOString()),
          reading(v, new Date(from.getTime() - 1).toISOString()),
        ],
      }).expect(200);
      const res = await call(
        'get',
        `/vehicles/${v}/readings?${window(from.toISOString(), to.toISOString())}`,
      ).expect(200);
      expect((res.body as { data: unknown[] }).data).toHaveLength(2);
    });

    it('rejects a range over 7 days, to <= from, missing bounds and bad limit', async () => {
      const from = new Date(Date.now() - 10 * DAY).toISOString();
      const over = new Date(Date.parse(from) + 7 * DAY + 1).toISOString();
      await call(
        'get',
        `/vehicles/${vehicleA}/readings?${window(from, over)}`,
      ).expect(400);
      await call(
        'get',
        `/vehicles/${vehicleA}/readings?${window(from, from)}`,
      ).expect(400);
      await call('get', `/vehicles/${vehicleA}/readings`).expect(400);
      await call(
        'get',
        `/vehicles/${vehicleA}/readings?${window(ago(DAY), ago(0))}&limit=1001`,
      ).expect(400);
    });

    it('returns 404 for another organization vehicle and for an unknown one', async () => {
      const q = window(ago(DAY), ago(0));
      const other = await call('get', `/vehicles/${vehicleB}/readings?${q}`);
      const unknown = await call(
        'get',
        `/vehicles/${UNKNOWN_ID}/readings?${q}`,
      );
      expect(other.status).toBe(404);
      expect(other.body).toEqual(NOT_FOUND);
      expect(unknown.body).toEqual(NOT_FOUND);
    });

    it('returns 400 for a malformed vehicle id', async () => {
      await call(
        'get',
        `/vehicles/not-a-uuid/readings?${window(ago(DAY), ago(0))}`,
      ).expect(400);
    });

    it('never returns a reading stored for another organization under the same vehicleId', async () => {
      const v = await newVehicle('a');
      const ts = new Date(Date.now() - 5 * MIN);
      await readings.insertOne({
        timestamp: ts,
        meta: { organizationId: orgOf.b, vehicleId: v },
        location: {
          type: 'Point' as const,
          coordinates: [31, 30] as [number, number],
        },
        speedKph: 77,
        receivedAt: new Date(),
      });
      await post(
        '/readings',
        reading(v, new Date(ts.getTime() - MIN).toISOString()),
      ).expect(201);

      const res = await call(
        'get',
        `/vehicles/${v}/readings?${window(ago(DAY), ago(0))}`,
      ).expect(200);
      const data = (res.body as { data: { speedKph: number }[] }).data;
      expect(data).toHaveLength(1);
      expect(data[0].speedKph).toBe(50);
    });
  });

  describe('latest', () => {
    it('returns 404 before any reading with the "no telemetry" message', async () => {
      const v = await newVehicle('a');
      const res = await call('get', `/vehicles/${v}/latest`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(
        errorBody(404, 'No telemetry for this vehicle yet'),
      );
    });

    it('returns 404 "Vehicle not found" for a foreign vehicle', async () => {
      const res = await call('get', `/vehicles/${vehicleB}/latest`);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('keeps the newest reading after out-of-order ingestion and includes updatedAt', async () => {
      const v = await newVehicle('a');
      const newest = ago(MIN);
      await post('/readings', reading(v, newest, { speedKph: 90 })).expect(201);
      await post(
        '/readings',
        reading(v, ago(10 * MIN), { speedKph: 10 }),
      ).expect(201);
      await post('/readings', reading(v, newest, { speedKph: 11 })).expect(201);

      const res = await call('get', `/vehicles/${v}/latest`).expect(200);
      expect(res.body).toMatchObject({
        vehicleId: v,
        timestamp: newest,
        speedKph: 90,
      });
      expect(typeof (res.body as Body).updatedAt).toBe('string');
      expect(res.body).not.toHaveProperty('organizationId');
      expect(res.body).not.toHaveProperty('_id');
    });

    it('paginates the fleet list by vehicleId and never lists another organization', async () => {
      const vs = [
        await newVehicle('a'),
        await newVehicle('a'),
        await newVehicle('a'),
      ];
      for (const v of vs)
        await post('/readings', reading(v, ago(MIN))).expect(201);
      await post('/readings', reading(vehicleB, ago(MIN)), 'B_ADMIN').expect(
        201,
      );
      // A latest doc seeded directly for B must not leak either.
      const seeded = randomUUID();
      await latest.insertOne({
        organizationId: orgOf.b,
        vehicleId: seeded,
        timestamp: new Date(),
        location: {
          type: 'Point' as const,
          coordinates: [31, 30] as [number, number],
        },
        speedKph: 1,
        receivedAt: new Date(),
        updatedAt: new Date(),
      });

      const ids: string[] = [];
      let cursor: string | null = null;
      let guard = 0;
      do {
        const res = await call(
          'get',
          `/latest?limit=2${cursor ? `&after=${cursor}` : ''}`,
        ).expect(200);
        const body = res.body as {
          data: { vehicleId: string }[];
          meta: { nextCursor: string | null };
        };
        ids.push(...body.data.map((d) => d.vehicleId));
        cursor = body.meta.nextCursor;
        guard++;
      } while (cursor && guard < 50);

      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(vs));
      expect(ids).not.toContain(vehicleB);
      expect(ids).not.toContain(seeded);
    });

    it('rejects a bad cursor and limit', async () => {
      await call('get', '/latest?after=nope').expect(400);
      await call('get', '/latest?limit=0').expect(400);
      await call('get', '/latest?limit=101').expect(400);
    });
  });

  describe('GET /latest/near', () => {
    it('returns own vehicles sorted by distance, respects the radius, never the other org', async () => {
      const [v0, v1, v2] = [
        await newVehicle('a'),
        await newVehicle('a'),
        await newVehicle('a'),
      ];
      const at = (
        v: string,
        latitude: number,
        token: keyof typeof tokens = 'A_ADMIN',
      ) =>
        post(
          '/readings',
          reading(v, ago(MIN), { location: { latitude, longitude: 10 } }),
          token,
        ).expect(201);
      await at(v2, 10.01);
      await at(v0, 10);
      await at(v1, 10.001);
      // Same point as v0, but another organization.
      await at(vehicleB, 10, 'B_ADMIN');

      const wide = await call(
        'get',
        '/latest/near?latitude=10&longitude=10&radiusMeters=5000',
      ).expect(200);
      const data = (
        wide.body as {
          data: {
            vehicleId: string;
            distanceMeters: number;
            updatedAt: string;
          }[];
        }
      ).data;
      expect(data.map((d) => d.vehicleId)).toEqual([v0, v1, v2]);
      expect(data[0].distanceMeters).toBe(0);
      expect(data[1].distanceMeters).toBeGreaterThan(100);
      expect(data[1].distanceMeters).toBeLessThan(120);
      expect(data[1].distanceMeters).toBe(
        Math.round(data[1].distanceMeters * 10) / 10,
      );
      expect(typeof data[0].updatedAt).toBe('string');

      const narrow = await call(
        'get',
        '/latest/near?latitude=10&longitude=10&radiusMeters=500',
      ).expect(200);
      expect(
        (narrow.body as { data: { vehicleId: string }[] }).data.map(
          (d) => d.vehicleId,
        ),
      ).toEqual([v0, v1]);

      const one = await call(
        'get',
        '/latest/near?latitude=10&longitude=10&radiusMeters=5000&limit=1',
      ).expect(200);
      expect((one.body as { data: unknown[] }).data).toHaveLength(1);
    });

    it('returns an empty list when nothing is in range', async () => {
      const res = await call(
        'get',
        '/latest/near?latitude=-60&longitude=-120&radiusMeters=100',
      ).expect(200);
      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it.each([
      'latitude=91&longitude=10',
      'latitude=10&longitude=181',
      'latitude=10',
      'latitude=&longitude=10',
      'latitude=10&longitude=10&radiusMeters=',
      'latitude=10&longitude=10&radiusMeters=50001',
      'latitude=10&longitude=10&radiusMeters=0',
      'latitude=10&longitude=10&limit=51',
      'latitude=abc&longitude=10',
    ])('rejects %s with 400', async (qs) => {
      await call('get', `/latest/near?${qs}`).expect(400);
    });
  });

  describe('GET /vehicles/:id/daily', () => {
    // Dates are relative to now so retention and the future-skew rules never
    // expire the seed. D is a UTC date 5 days ago; X = D-1, P = D-2, PP = D-3.
    // A reading at X 22:30Z is on local day D in Africa/Cairo (UTC+2 or +3).
    const dayStr = (daysAgo: number): string =>
      new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
    const D = dayStr(5);
    const X = dayStr(6);
    const P = dayStr(7);
    const PP = dayStr(8);

    let daily: string;
    const seed = (
      iso: string,
      speedKph: number,
      extra: Partial<TelemetryReadingDocument> = {},
    ) => ({
      timestamp: new Date(iso),
      meta: { organizationId: orgOf.a, vehicleId: daily },
      location: {
        type: 'Point' as const,
        coordinates: [31, 30] as [number, number],
      },
      speedKph,
      receivedAt: new Date(),
      ...extra,
    });

    beforeAll(async () => {
      daily = await newVehicle('a');
      await readings.insertMany([
        seed(`${X}T10:00:00Z`, 40, {
          fuelLevelPercent: 80,
          odometerKm: 1000,
        }),
        seed(`${X}T20:00:00Z`, 60, {
          fuelLevelPercent: 70,
          odometerKm: 1050.5,
        }),
        seed(`${X}T22:30:00Z`, 100, {
          fuelLevelPercent: 60,
          odometerKm: 1100,
        }),
        seed(`${P}T12:00:00Z`, 10),
        // Another organization's reading for the same vehicleId must not count.
        {
          ...seed(`${X}T11:00:00Z`, 250),
          meta: { organizationId: orgOf.b, vehicleId: daily },
        },
      ]);
    });

    it('buckets by UTC day', async () => {
      const res = await call(
        'get',
        `/vehicles/${daily}/daily?from=${X}&to=${D}&timezone=UTC`,
      ).expect(200);
      expect(res.body).toEqual({
        vehicleId: daily,
        timezone: 'UTC',
        from: X,
        to: D,
        data: [
          {
            date: X,
            readings: 3,
            avgSpeedKph: 66.7,
            maxSpeedKph: 100,
            avgFuelLevelPercent: 70,
            distanceKm: 100,
          },
        ],
      });
    });

    it('buckets 22:30Z into the next local day in Africa/Cairo', async () => {
      const res = await call(
        'get',
        `/vehicles/${daily}/daily?from=${X}&to=${D}&timezone=Africa%2FCairo`,
      ).expect(200);
      expect((res.body as Body).data).toEqual([
        {
          date: X,
          readings: 2,
          avgSpeedKph: 50,
          maxSpeedKph: 60,
          avgFuelLevelPercent: 75,
          distanceKm: 50.5,
        },
        {
          date: D,
          readings: 1,
          avgSpeedKph: 100,
          maxSpeedKph: 100,
          avgFuelLevelPercent: 60,
          distanceKm: 0,
        },
      ]);
    });

    it('defaults the timezone to UTC, returns null for absent fuel/odometer and omits empty days', async () => {
      const res = await call(
        'get',
        `/vehicles/${daily}/daily?from=${PP}&to=${X}`,
      ).expect(200);
      const body = res.body as { timezone: string; data: Body[] };
      expect(body.timezone).toBe('UTC');
      expect(body.data.map((d) => d.date)).toEqual([P, X]);
      expect(body.data[0]).toMatchObject({
        readings: 1,
        avgFuelLevelPercent: null,
        distanceKm: null,
      });
    });

    it('returns an empty list for a range without readings', async () => {
      const res = await call(
        'get',
        `/vehicles/${daily}/daily?from=2026-01-01&to=2026-01-02`,
      ).expect(200);
      expect((res.body as Body).data).toEqual([]);
    });

    it('accepts 31 days inclusive and rejects 32 days', async () => {
      await call(
        'get',
        `/vehicles/${daily}/daily?from=${dayStr(35)}&to=${D}`,
      ).expect(200);
      await call(
        'get',
        `/vehicles/${daily}/daily?from=${dayStr(35)}&to=${dayStr(4)}`,
      ).expect(400);
    });

    it('accepts to == from and rejects to < from', async () => {
      await call('get', `/vehicles/${daily}/daily?from=${X}&to=${X}`).expect(
        200,
      );
      await call('get', `/vehicles/${daily}/daily?from=${X}&to=${P}`).expect(
        400,
      );
    });

    it('rejects fixed-offset and unknown time zones and bad dates', async () => {
      const base = `/vehicles/${daily}/daily?from=${X}&to=${D}`;
      await call('get', `${base}&timezone=%2B03:00`).expect(400);
      await call('get', `${base}&timezone=Mars%2FBase`).expect(400);
      await call('get', `${base}&timezone=`).expect(400);
      await call(
        'get',
        `/vehicles/${daily}/daily?from=2026-1-30&to=${D}`,
      ).expect(400);
      await call('get', `/vehicles/${daily}/daily`).expect(400);
    });

    it('returns 404 for another organization vehicle', async () => {
      const res = await call(
        'get',
        `/vehicles/${vehicleB}/daily?from=${X}&to=${D}`,
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });
  });
});
