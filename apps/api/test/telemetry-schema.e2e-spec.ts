import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import {
  type Db,
  type IndexDescriptionInfo,
  MongoBulkWriteError,
  MongoClient,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb';
import type { AuthUser } from '../src/auth/auth.types.js';
import { TelemetryIngestionService } from '../src/telemetry/telemetry-ingestion.service.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from '../src/telemetry/mongo/telemetry-documents.js';
import { mapMongoError } from '../src/telemetry/mongo/mongo-errors.js';
import {
  ensureTelemetrySchema,
  READINGS_INDEXES,
  READINGS_RETIRED_INDEXES,
  TELEMETRY_READINGS,
  TelemetrySchemaError,
  VEHICLE_LATEST_STATUS,
  verifyTelemetrySchema,
  LATEST_STATUS_VALIDATOR,
} from '../src/telemetry/mongo/telemetry-schema.js';
import {
  describeWithMongo,
  mongoTestEnv,
  uniqueDbName,
} from './utils/mongo-test-env.js';

describeWithMongo('Telemetry schema against MongoDB (integration)', () => {
  const env = mongoTestEnv();
  const created: string[] = [];
  let client: MongoClient;

  // Each scenario gets its own database, dropped in afterAll.
  const freshDb = (scenario: string): Db => {
    const name = uniqueDbName(`fleetops_schema_${scenario}_test`);
    created.push(name);
    return client.db(name);
  };

  const indexesOf = async (db: Db, name: string) =>
    (await db
      .collection(name)
      .listIndexes()
      .toArray()) as IndexDescriptionInfo[];

  const collectionInfo = async (db: Db, name: string) =>
    (await db.listCollections({ name }, { nameOnly: false }).toArray())[0];

  beforeAll(async () => {
    client = new MongoClient(env!.uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
  });

  afterAll(async () => {
    try {
      for (const name of created) await client.db(name).dropDatabase();
    } finally {
      await client.close();
    }
  });

  it('creates both collections, options, validator and indexes on an empty database', async () => {
    const db = freshDb('create');

    const report = await ensureTelemetrySchema(db, { retentionDays: 30 });

    expect(report.created).toEqual(
      expect.arrayContaining([
        `collection ${TELEMETRY_READINGS}`,
        `collection ${VEHICLE_LATEST_STATUS}`,
        `index ${TELEMETRY_READINGS}.org_vehicle_timestamp`,
        `index ${VEHICLE_LATEST_STATUS}.org_vehicle_unique`,
        `index ${VEHICLE_LATEST_STATUS}.org_location_2dsphere`,
      ]),
    );
    expect(report.dropped).toEqual([
      `index ${TELEMETRY_READINGS}.meta_1_timestamp_1`,
    ]);

    const readings = await collectionInfo(db, TELEMETRY_READINGS);
    expect(readings?.type).toBe('timeseries');
    expect(readings?.options).toMatchObject({
      timeseries: {
        timeField: 'timestamp',
        metaField: 'meta',
        granularity: 'seconds',
      },
      expireAfterSeconds: 2592000,
    });
    const readingIndexes = await indexesOf(db, TELEMETRY_READINGS);
    const readingIndex = readingIndexes.find(
      (i) => i.name === 'org_vehicle_timestamp',
    );
    expect(readingIndex?.key).toEqual({
      'meta.organizationId': 1,
      'meta.vehicleId': 1,
      timestamp: -1,
    });

    const latest = await collectionInfo(db, VEHICLE_LATEST_STATUS);
    expect(latest?.type).toBe('collection');
    expect(latest?.options).toMatchObject({
      validator: LATEST_STATUS_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    const latestIndexes = await indexesOf(db, VEHICLE_LATEST_STATUS);
    const unique = latestIndexes.find((i) => i.name === 'org_vehicle_unique');
    expect(unique?.key).toEqual({ organizationId: 1, vehicleId: 1 });
    expect(unique?.unique).toBe(true);
    const geo = latestIndexes.find((i) => i.name === 'org_location_2dsphere');
    expect(geo?.key).toEqual({ organizationId: 1, location: '2dsphere' });
    expect(readingIndexes.map((i) => i.name)).not.toContain(
      'meta_1_timestamp_1',
    );
  });

  it('is idempotent: a second run changes nothing', async () => {
    const db = freshDb('idem');
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    const before = (await indexesOf(db, TELEMETRY_READINGS)).length;

    const report = await ensureTelemetrySchema(db, { retentionDays: 30 });

    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.dropped).toEqual([]);
    expect(report.unchanged).toHaveLength(5);
    expect((await indexesOf(db, TELEMETRY_READINGS)).length).toBe(before);
  });

  it('updates retention in place with collMod and reports it', async () => {
    const db = freshDb('retention');
    await ensureTelemetrySchema(db, { retentionDays: 30 });

    const report = await ensureTelemetrySchema(db, { retentionDays: 7 });

    expect(report.updated).toEqual([
      `collection ${TELEMETRY_READINGS} (retention)`,
    ]);
    expect(report.created).toEqual([]);
    const readings = await collectionInfo(db, TELEMETRY_READINGS);
    expect(readings?.options?.expireAfterSeconds).toBe(7 * 86400);
  });

  it('reconciles a drifted validator on the latest status collection', async () => {
    const db = freshDb('validator');
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    await db.command({
      collMod: VEHICLE_LATEST_STATUS,
      validationLevel: 'moderate',
    });

    const report = await ensureTelemetrySchema(db, { retentionDays: 30 });

    expect(report.updated).toEqual([
      `collection ${VEHICLE_LATEST_STATUS} (validator)`,
    ]);
    const latest = await collectionInfo(db, VEHICLE_LATEST_STATUS);
    expect(latest?.options?.validationLevel).toBe('strict');
  });

  it('refuses a pre-existing plain telemetry_readings and never drops it', async () => {
    const db = freshDb('plain');
    await db.createCollection(TELEMETRY_READINGS);
    await db.collection(TELEMETRY_READINGS).insertOne({ keep: 'me' });

    await expect(
      ensureTelemetrySchema(db, { retentionDays: 30 }),
    ).rejects.toBeInstanceOf(TelemetrySchemaError);

    const info = await collectionInfo(db, TELEMETRY_READINGS);
    expect(info?.type).toBe('collection');
    expect(await db.collection(TELEMETRY_READINGS).countDocuments()).toBe(1);
  });

  it('refuses an org_vehicle_timestamp index with different keys', async () => {
    const db = freshDb('indexconflict');
    await db.createCollection(TELEMETRY_READINGS, {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'meta',
        granularity: 'seconds',
      },
      expireAfterSeconds: 30 * 86400,
    });
    await db
      .collection(TELEMETRY_READINGS)
      .createIndex(
        { 'meta.organizationId': 1, timestamp: -1 },
        { name: READINGS_INDEXES[0].name },
      );

    await expect(
      ensureTelemetrySchema(db, { retentionDays: 30 }),
    ).rejects.toBeInstanceOf(TelemetrySchemaError);
  });

  it('survives two concurrent runs on a fresh database', async () => {
    const db = freshDb('concurrent');

    const results = await Promise.allSettled([
      ensureTelemetrySchema(db, { retentionDays: 30 }),
      ensureTelemetrySchema(db, { retentionDays: 30 }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await verifyTelemetrySchema(db)).toEqual([]);
  });

  it('verifyTelemetrySchema reports problems on an empty database and none after ensure', async () => {
    const db = freshDb('verify');

    const before = await verifyTelemetrySchema(db);
    expect(before.length).toBeGreaterThan(0);
    expect(before.join(' ')).toContain(TELEMETRY_READINGS);

    await ensureTelemetrySchema(db, { retentionDays: 30 });

    expect(await verifyTelemetrySchema(db)).toEqual([]);
  });

  it('drops a retired index that comes back, reports it once, and verify ignores it meanwhile', async () => {
    const db = freshDb('retired');
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    const [retired] = READINGS_RETIRED_INDEXES;
    await db
      .collection(TELEMETRY_READINGS)
      .createIndex({ meta: 1, timestamp: 1 }, { name: retired });

    expect(await verifyTelemetrySchema(db)).toEqual([]);

    const report = await ensureTelemetrySchema(db, { retentionDays: 30 });
    expect(report.dropped).toEqual([`index ${TELEMETRY_READINGS}.${retired}`]);
    expect(
      (await indexesOf(db, TELEMETRY_READINGS)).map((i) => i.name),
    ).not.toContain(retired);
    expect(
      (await ensureTelemetrySchema(db, { retentionDays: 30 })).dropped,
    ).toEqual([]);
  });

  it('survives concurrent runs while the retired index exists (IndexNotFound ignored)', async () => {
    const db = freshDb('retiredrace');
    await db.createCollection(TELEMETRY_READINGS, {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'meta',
        granularity: 'seconds',
      },
    });

    const runs = await Promise.allSettled([
      ensureTelemetrySchema(db, { retentionDays: 30 }),
      ensureTelemetrySchema(db, { retentionDays: 30 }),
      ensureTelemetrySchema(db, { retentionDays: 30 }),
    ]);

    expect(runs.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(await verifyTelemetrySchema(db)).toEqual([]);
  });

  it('boot check fails on a database missing the 2dsphere index (pre-L8 setup)', async () => {
    const db = freshDb('prel8');
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    await db
      .collection(VEHICLE_LATEST_STATUS)
      .dropIndex('org_location_2dsphere');

    expect(await verifyTelemetrySchema(db)).toEqual([
      `index ${VEHICLE_LATEST_STATUS}.org_location_2dsphere is missing`,
    ]);
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    expect(await verifyTelemetrySchema(db)).toEqual([]);
  });

  describe('query plans (explain pins)', () => {
    let db: Db;
    const org = randomUUID();
    const vehicle = randomUUID();
    const planText = (plan: unknown) => JSON.stringify(plan);

    beforeAll(async () => {
      db = freshDb('explain');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
      const base = Date.now() - 3_600_000;
      const docs = Array.from({ length: 300 }, (_, i) => ({
        timestamp: new Date(base + i * 10_000),
        meta: { organizationId: org, vehicleId: vehicle },
        location: { type: 'Point', coordinates: [31, 30] },
        speedKph: 10,
        receivedAt: new Date(),
      }));
      await db.collection(TELEMETRY_READINGS).insertMany(docs);
      await db.collection(VEHICLE_LATEST_STATUS).insertOne({
        organizationId: org,
        vehicleId: vehicle,
        timestamp: new Date(),
        location: { type: 'Point', coordinates: [31, 30] },
        speedKph: 10,
        receivedAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('the readings page uses org_vehicle_timestamp', async () => {
      const plan = await db
        .collection(TELEMETRY_READINGS)
        .find({
          'meta.organizationId': org,
          'meta.vehicleId': vehicle,
          timestamp: { $gte: new Date(0), $lte: new Date() },
        })
        .sort({ timestamp: -1 })
        .limit(100)
        .explain('queryPlanner');
      expect(planText(plan)).toContain('org_vehicle_timestamp');
    });

    it('the daily aggregation uses org_vehicle_timestamp', async () => {
      const plan = await db
        .collection(TELEMETRY_READINGS)
        .aggregate([
          {
            $match: {
              'meta.organizationId': org,
              'meta.vehicleId': vehicle,
              timestamp: { $gte: new Date(0), $lt: new Date() },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp',
                  timezone: 'Africa/Cairo',
                },
              },
              n: { $sum: 1 },
            },
          },
        ])
        .explain('queryPlanner');
      expect(planText(plan)).toContain('org_vehicle_timestamp');
    });

    const geoNear = (query?: Record<string, unknown>) => ({
      $geoNear: {
        near: { type: 'Point', coordinates: [31, 30] },
        key: 'location',
        distanceField: 'distanceMeters',
        maxDistance: 1000,
        spherical: true,
        ...(query ? { query } : {}),
      },
    });

    it('$geoNear scoped by organizationId uses org_location_2dsphere', async () => {
      const plan = await db
        .collection(VEHICLE_LATEST_STATUS)
        .aggregate([geoNear({ organizationId: org })])
        .explain('queryPlanner');
      expect(planText(plan)).toContain('org_location_2dsphere');
    });

    it('$geoNear without organizationId fails with 291 (no usable plan)', async () => {
      await expect(
        db.collection(VEHICLE_LATEST_STATUS).aggregate([geoNear()]).toArray(),
      ).rejects.toMatchObject({ code: 291 });
    });
  });

  describe('latest status maintained by the ingestion service (real Mongo)', () => {
    let db: Db;
    let service: TelemetryIngestionService;
    const org = randomUUID();
    const user = { organizationId: org } as unknown as AuthUser;
    const known = new Set<string>();

    const dto = (vehicleId: string, timestamp: Date, speedKph = 10) => ({
      vehicleId,
      timestamp: timestamp.toISOString(),
      location: { latitude: 30, longitude: 31 },
      speedKph,
    });
    const latestOf = (vehicleId: string) =>
      db
        .collection<VehicleLatestStatusDocument>(VEHICLE_LATEST_STATUS)
        .find({ organizationId: org, vehicleId })
        .toArray();

    beforeAll(async () => {
      db = freshDb('ingest');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
      service = new TelemetryIngestionService(
        db.collection<TelemetryReadingDocument>(TELEMETRY_READINGS),
        db.collection<VehicleLatestStatusDocument>(VEHICLE_LATEST_STATUS),
        {
          existingVehicleIds: (_org, ids) =>
            Promise.resolve(new Set(ids.filter((id) => known.has(id)))),
        },
        { get: () => 30 } as unknown as ConfigService<never, true>,
      );
    });

    it('keeps the max timestamp after 50 single ingests in random order', async () => {
      const vehicle = randomUUID();
      known.add(vehicle);
      const base = Date.now() - 600_000;
      const stamps = Array.from({ length: 50 }, (_, i) => base + i * 1000);
      for (let i = stamps.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [stamps[i], stamps[j]] = [stamps[j], stamps[i]];
      }
      for (const t of stamps) {
        await service.ingestOne(user, dto(vehicle, new Date(t)));
      }

      const docs = await latestOf(vehicle);
      expect(docs).toHaveLength(1);
      expect(docs[0].timestamp.getTime()).toBe(Math.max(...stamps));
    });

    it('10 concurrent first ingests create one latest doc with the max timestamp', async () => {
      const vehicle = randomUUID();
      known.add(vehicle);
      const base = Date.now() - 600_000;
      const stamps = Array.from({ length: 10 }, (_, i) => base + i * 1000);

      await Promise.all(
        stamps.map((t) => service.ingestOne(user, dto(vehicle, new Date(t)))),
      );

      const docs = await latestOf(vehicle);
      expect(docs).toHaveLength(1);
      expect(docs[0].timestamp.getTime()).toBe(Math.max(...stamps));
    });

    it('replaying the same or an older reading changes nothing', async () => {
      const vehicle = randomUUID();
      known.add(vehicle);
      const newest = new Date(Date.now() - 60_000);
      await service.ingestOne(user, dto(vehicle, newest, 80));
      const before = (await latestOf(vehicle))[0];

      await service.ingestOne(user, dto(vehicle, newest, 99));
      await service.ingestOne(
        user,
        dto(vehicle, new Date(newest.getTime() - 5000), 1),
      );

      const after = await latestOf(vehicle);
      expect(after).toHaveLength(1);
      expect(after[0]).toEqual(before);
      expect(after[0].speedKph).toBe(80);
    });

    it('a batch updates latest per vehicle and a newer reading replaces optional fields', async () => {
      const [v1, v2] = [randomUUID(), randomUUID()];
      known.add(v1).add(v2);
      const t = Date.now() - 120_000;
      const out = await service.ingestBatch(user, {
        readings: [
          { ...dto(v1, new Date(t)), fuelLevelPercent: 50 },
          dto(v1, new Date(t + 1000)),
          dto(v2, new Date(t)),
        ],
      });
      expect(out).toEqual({ accepted: 3, rejected: [] });

      const [doc] = await latestOf(v1);
      expect(doc.timestamp.getTime()).toBe(t + 1000);
      expect(doc).not.toHaveProperty('fuelLevelPercent');
      expect(await latestOf(v2)).toHaveLength(1);
    });
  });

  describe('server behavior the design relies on', () => {
    let db: Db;
    const meta = () => ({
      organizationId: randomUUID(),
      vehicleId: randomUUID(),
    });

    beforeAll(async () => {
      db = freshDb('behavior');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
    });

    it('rejects a non-date timestamp on the time series with code 2', async () => {
      await expect(
        db
          .collection(TELEMETRY_READINGS)
          .insertOne({ timestamp: 'not-a-date', meta: meta() }),
      ).rejects.toMatchObject({ code: 2 });
    });

    it('inserts the good reading when one reading in an unordered batch is bad', async () => {
      const readings = db.collection(TELEMETRY_READINGS);
      const m = meta();
      const error: unknown = await readings
        .insertMany(
          [
            { timestamp: new Date(), meta: m },
            { timestamp: 'bad', meta: m },
          ] as never,
          { ordered: false },
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(MongoBulkWriteError);
      expect((error as MongoBulkWriteError).insertedCount).toBe(1);
      expect((error as MongoBulkWriteError).code).toBe(2);
      expect(
        await readings.countDocuments({ 'meta.vehicleId': m.vehicleId }),
      ).toBe(1);
    });

    it('rejects a unique index on a time series with code 72', async () => {
      await expect(
        db
          .collection(TELEMETRY_READINGS)
          .createIndex({ 'meta.vehicleId': 1, timestamp: 1 }, { unique: true }),
      ).rejects.toMatchObject({ code: 72 });
    });
  });

  describe('vehicle_latest_status validator and unique index', () => {
    let db: Db;
    const doc = (over: Record<string, unknown> = {}) => ({
      organizationId: randomUUID(),
      vehicleId: randomUUID(),
      timestamp: new Date(),
      location: { type: 'Point', coordinates: [31.2, 30.0] },
      speedKph: 50,
      receivedAt: new Date(),
      updatedAt: new Date(),
      ...over,
    });

    beforeAll(async () => {
      db = freshDb('latest');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
    });

    const latest = () => db.collection(VEHICLE_LATEST_STATUS);

    it('inserts a valid document', async () => {
      await expect(latest().insertOne(doc())).resolves.toMatchObject({
        acknowledged: true,
      });
    });

    it('rejects a missing location with 121', async () => {
      const { location: _omit, ...rest } = doc();
      void _omit;
      await expect(latest().insertOne(rest)).rejects.toMatchObject({
        code: 121,
      });
    });

    it('rejects an extra top-level field with 121', async () => {
      await expect(
        latest().insertOne(doc({ surprise: true })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects an engine without "on" with 121', async () => {
      await expect(
        latest().insertOne(doc({ engine: { rpm: 1000 } })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects speedKph 301 and negative speed with 121', async () => {
      await expect(
        latest().insertOne(doc({ speedKph: 301 })),
      ).rejects.toMatchObject({ code: 121 });
      await expect(
        latest().insertOne(doc({ speedKph: -1 })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects out-of-range optional measurements with 121', async () => {
      for (const over of [
        { fuelLevelPercent: 101 },
        { odometerKm: -1 },
        { engine: { on: true, rpm: 10_001 } },
        { engine: { on: true, coolantTempC: 151 } },
      ]) {
        await expect(latest().insertOne(doc(over))).rejects.toMatchObject({
          code: 121,
        });
      }
    });

    it('accepts a full valid document with engine metrics', async () => {
      await expect(
        latest().insertOne(
          doc({
            fuelLevelPercent: 50,
            odometerKm: 1000.5,
            engine: { on: true, rpm: 2000, coolantTempC: 90 },
          }),
        ),
      ).resolves.toMatchObject({ acknowledged: true });
    });

    it('rejects a missing organizationId with 121', async () => {
      const { organizationId: _omit, ...rest } = doc();
      void _omit;
      await expect(latest().insertOne(rest)).rejects.toMatchObject({
        code: 121,
      });
    });

    it('rejects a non-UUID vehicleId with 121', async () => {
      await expect(
        latest().insertOne(doc({ vehicleId: 'not-a-uuid' })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects an uppercase UUID with 121', async () => {
      await expect(
        latest().insertOne(doc({ vehicleId: randomUUID().toUpperCase() })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects a string timestamp with 121', async () => {
      await expect(
        latest().insertOne(doc({ timestamp: new Date().toISOString() })),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects out-of-range coordinates with 121', async () => {
      await expect(
        latest().insertOne(
          doc({ location: { type: 'Point', coordinates: [31.2, 200] } }),
        ),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('rejects a duplicate (organization, vehicle) with 11000', async () => {
      const first = doc();
      await latest().insertOne(first);
      await expect(
        latest().insertOne(
          doc({
            organizationId: first.organizationId,
            vehicleId: first.vehicleId,
          }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('allows the same vehicleId in another organization', async () => {
      const first = doc();
      await latest().insertOne(first);
      await expect(
        latest().insertOne(doc({ vehicleId: first.vehicleId })),
      ).resolves.toMatchObject({ acknowledged: true });
    });
  });

  describe('mapMongoError on real driver errors', () => {
    it('maps a real duplicate key error to 409', async () => {
      const db = freshDb('mapdup');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
      const base = {
        organizationId: randomUUID(),
        vehicleId: randomUUID(),
        timestamp: new Date(),
        location: { type: 'Point', coordinates: [31.2, 30.0] },
        speedKph: 50,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };
      const coll = db.collection(VEHICLE_LATEST_STATUS);
      await coll.insertOne({ ...base });

      const error: unknown = await coll
        .insertOne({ ...base })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(MongoServerError);
      const mapped = mapMongoError(error);
      expect(mapped?.getStatus()).toBe(409);
    });

    it('maps a real server selection error to 503', async () => {
      const unreachable = new MongoClient('mongodb://127.0.0.1:1/', {
        serverSelectionTimeoutMS: 500,
        directConnection: true,
      });
      const error: unknown = await unreachable
        .connect()
        .catch((e: unknown) => e);
      await unreachable.close().catch(() => undefined);

      expect(error).toBeInstanceOf(MongoServerSelectionError);
      const mapped = mapMongoError(error);
      expect(mapped?.getStatus()).toBe(503);
      expect(mapped?.message).toBe('Telemetry storage is unavailable');
    });
  });
});
