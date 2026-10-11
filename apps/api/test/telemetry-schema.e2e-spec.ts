import { randomUUID } from 'node:crypto';
import {
  type Db,
  type IndexDescriptionInfo,
  MongoBulkWriteError,
  MongoClient,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb';
import { mapMongoError } from '../src/telemetry/mongo/mongo-errors.js';
import {
  ensureTelemetrySchema,
  READINGS_INDEXES,
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
      ]),
    );

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
  });

  it('is idempotent: a second run changes nothing', async () => {
    const db = freshDb('idem');
    await ensureTelemetrySchema(db, { retentionDays: 30 });
    const before = (await indexesOf(db, TELEMETRY_READINGS)).length;

    const report = await ensureTelemetrySchema(db, { retentionDays: 30 });

    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.unchanged).toHaveLength(4);
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
      updatedAt: new Date(),
      ...over,
    });

    beforeAll(async () => {
      db = freshDb('latest');
      await ensureTelemetrySchema(db, { retentionDays: 30 });
    });

    const latest = () => db.collection(VEHICLE_LATEST_STATUS);

    it('inserts a valid document, with and without a location', async () => {
      await expect(latest().insertOne(doc())).resolves.toMatchObject({
        acknowledged: true,
      });
      await expect(
        latest().insertOne(
          doc({ location: { type: 'Point', coordinates: [31.2, 30.0] } }),
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
