import { isDeepStrictEqual } from 'node:util';
import {
  type CollectionInfo,
  type CreateCollectionOptions,
  type Db,
  type Document,
  type IndexDescriptionInfo,
  MongoServerError,
} from 'mongodb';

/**
 * Schema-as-code for the telemetry database. MongoDB has no migration system:
 * `npm run mongo:setup` applies this idempotently, and the API only verifies
 * it at boot (read-only). Not a repository: services use typed collections.
 */

export const TELEMETRY_READINGS = 'telemetry_readings';
export const VEHICLE_LATEST_STATUS = 'vehicle_latest_status';

const NAMESPACE_EXISTS = 48;
const INDEX_OPTIONS_CONFLICT = 85;
const INDEX_KEY_SPECS_CONFLICT = 86;

const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

export class TelemetrySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetrySchemaError';
  }
}

export interface IndexSpec {
  name: string;
  key: Record<string, 1 | -1>;
  unique?: boolean;
}

export interface TelemetryReadingsOptions {
  timeseries: {
    timeField: 'timestamp';
    metaField: 'meta';
    granularity: 'seconds';
  };
  expireAfterSeconds: number;
}

/** Time series options are fixed at creation. Retention is adjustable. */
export function telemetryReadingsOptions(
  retentionDays: number,
): TelemetryReadingsOptions {
  return {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'meta',
      granularity: 'seconds',
    },
    expireAfterSeconds: retentionDays * 86400,
  };
}

// MongoDB 7.0 rejects a validator on time series collections, so readings are
// validated only for the timestamp type (by the server) and by the app.
export const READINGS_INDEXES: IndexSpec[] = [
  {
    name: 'org_vehicle_timestamp',
    key: { 'meta.organizationId': 1, 'meta.vehicleId': 1, timestamp: -1 },
  },
];

const uuidString = { bsonType: 'string', pattern: UUID_PATTERN };

export const LATEST_STATUS_VALIDATOR: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['organizationId', 'vehicleId', 'timestamp', 'updatedAt'],
    properties: {
      organizationId: uuidString,
      vehicleId: uuidString,
      timestamp: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      location: {
        bsonType: 'object',
        required: ['type', 'coordinates'],
        additionalProperties: false,
        properties: {
          type: { enum: ['Point'] },
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: [
              { bsonType: ['double', 'int'], minimum: -180, maximum: 180 },
              { bsonType: ['double', 'int'], minimum: -90, maximum: 90 },
            ],
          },
        },
      },
    },
  },
};

export const LATEST_STATUS_VALIDATION = {
  validator: LATEST_STATUS_VALIDATOR,
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

export const LATEST_STATUS_INDEXES: IndexSpec[] = [
  {
    name: 'org_vehicle_unique',
    key: { organizationId: 1, vehicleId: 1 },
    unique: true,
  },
];

const sameKey = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

const indexMatches = (found: IndexDescriptionInfo, spec: IndexSpec) =>
  sameKey(found.key, spec.key) &&
  Boolean(found.unique) === Boolean(spec.unique);

/**
 * Pure check used at boot. Extra indexes are ignored; retention and validator
 * drift are not problems (the setup script reconciles them with collMod).
 */
export function findSchemaProblems(
  collections: CollectionInfo[],
  indexes: Record<string, IndexDescriptionInfo[]>,
): string[] {
  const problems: string[] = [];
  const byName = new Map(collections.map((c) => [c.name, c]));

  const readings = byName.get(TELEMETRY_READINGS);
  if (!readings) {
    problems.push(`collection ${TELEMETRY_READINGS} is missing`);
  } else {
    const expected = telemetryReadingsOptions(1).timeseries;
    const actual = readings.options?.timeseries as
      Partial<typeof expected> | undefined;
    if (
      readings.type !== 'timeseries' ||
      actual?.timeField !== expected.timeField ||
      actual?.metaField !== expected.metaField ||
      actual?.granularity !== expected.granularity
    ) {
      problems.push(
        `collection ${TELEMETRY_READINGS} is not a time series collection with timeField ${expected.timeField}, metaField ${expected.metaField}, granularity ${expected.granularity}`,
      );
    }
  }
  const latest = byName.get(VEHICLE_LATEST_STATUS);
  if (!latest) {
    problems.push(`collection ${VEHICLE_LATEST_STATUS} is missing`);
  } else if (latest.type !== undefined && latest.type !== 'collection') {
    problems.push(
      `collection ${VEHICLE_LATEST_STATUS} is a ${latest.type}, expected a plain collection`,
    );
  }

  const required: [string, IndexSpec[]][] = [
    [TELEMETRY_READINGS, READINGS_INDEXES],
    [VEHICLE_LATEST_STATUS, LATEST_STATUS_INDEXES],
  ];
  for (const [collection, specs] of required) {
    if (!byName.has(collection)) continue;
    for (const spec of specs) {
      const found = (indexes[collection] ?? []).find(
        (i) => i.name === spec.name,
      );
      if (!found) {
        problems.push(`index ${collection}.${spec.name} is missing`);
      } else if (!indexMatches(found, spec)) {
        problems.push(
          `index ${collection}.${spec.name} has a different definition`,
        );
      }
    }
  }
  return problems;
}

async function readState(db: Db) {
  const collections = await db
    .listCollections({}, { nameOnly: false })
    .toArray();
  const indexes: Record<string, IndexDescriptionInfo[]> = {};
  for (const name of [TELEMETRY_READINGS, VEHICLE_LATEST_STATUS]) {
    if (!collections.some((c) => c.name === name)) continue;
    indexes[name] = await listIndexes(db, name);
  }
  return { collections, indexes };
}

/** Read-only. Returns human-readable problems, empty when the schema is ready. */
export async function verifyTelemetrySchema(db: Db): Promise<string[]> {
  const { collections, indexes } = await readState(db);
  return findSchemaProblems(collections, indexes);
}

export interface EnsureReport {
  created: string[];
  updated: string[];
  unchanged: string[];
}

const hasCode = (
  error: unknown,
  ...codes: number[]
): error is MongoServerError =>
  error instanceof MongoServerError &&
  typeof error.code === 'number' &&
  codes.includes(error.code);

// The driver types listIndexes() as a cursor of any.
async function listIndexes(
  db: Db,
  name: string,
): Promise<IndexDescriptionInfo[]> {
  return (await db
    .collection(name)
    .listIndexes()
    .toArray()) as IndexDescriptionInfo[];
}

async function findCollection(
  db: Db,
  name: string,
): Promise<CollectionInfo | undefined> {
  const found = await db
    .listCollections({ name }, { nameOnly: false })
    .toArray();
  return found[0];
}

/**
 * Idempotent and concurrency-safe. Creates what is missing, reconciles
 * retention and the validator with collMod, and never drops anything.
 */
export async function ensureTelemetrySchema(
  db: Db,
  { retentionDays }: { retentionDays: number },
): Promise<EnsureReport> {
  const report: EnsureReport = { created: [], updated: [], unchanged: [] };

  const createOrFind = async (
    name: string,
    options: CreateCollectionOptions,
  ): Promise<CollectionInfo> => {
    const existing = await findCollection(db, name);
    if (existing) return existing;
    try {
      await db.createCollection(name, options);
      report.created.push(`collection ${name}`);
    } catch (error) {
      if (!hasCode(error, NAMESPACE_EXISTS)) throw error;
    }
    const info = await findCollection(db, name);
    if (!info) {
      throw new TelemetrySchemaError(`collection ${name} could not be created`);
    }
    return info;
  };

  // telemetry_readings (time series)
  const readingsOptions = telemetryReadingsOptions(retentionDays);
  const readings = await createOrFind(TELEMETRY_READINGS, readingsOptions);
  const actual = readings.options?.timeseries as
    Partial<TelemetryReadingsOptions['timeseries']> | undefined;
  const wanted = readingsOptions.timeseries;
  if (
    readings.type !== 'timeseries' ||
    actual?.timeField !== wanted.timeField ||
    actual?.metaField !== wanted.metaField ||
    actual?.granularity !== wanted.granularity
  ) {
    throw new TelemetrySchemaError(
      `${TELEMETRY_READINGS} exists but is not a time series collection with the expected options. Time series options cannot be changed in place: migrate the data and drop it manually.`,
    );
  }
  if (
    readings.options?.expireAfterSeconds !== readingsOptions.expireAfterSeconds
  ) {
    await db.command({
      collMod: TELEMETRY_READINGS,
      expireAfterSeconds: readingsOptions.expireAfterSeconds,
    });
    report.updated.push(`collection ${TELEMETRY_READINGS} (retention)`);
  } else if (!report.created.includes(`collection ${TELEMETRY_READINGS}`)) {
    report.unchanged.push(`collection ${TELEMETRY_READINGS}`);
  }

  // vehicle_latest_status (plain collection with validator)
  const latest = await createOrFind(
    VEHICLE_LATEST_STATUS,
    LATEST_STATUS_VALIDATION,
  );
  if (latest.type !== undefined && latest.type !== 'collection') {
    throw new TelemetrySchemaError(
      `${VEHICLE_LATEST_STATUS} exists but is a ${latest.type}, expected a plain collection`,
    );
  }
  const options = latest.options ?? {};
  const validationDrift =
    !isDeepStrictEqual(options.validator, LATEST_STATUS_VALIDATION.validator) ||
    options.validationLevel !== LATEST_STATUS_VALIDATION.validationLevel ||
    options.validationAction !== LATEST_STATUS_VALIDATION.validationAction;
  if (validationDrift) {
    await db.command({
      collMod: VEHICLE_LATEST_STATUS,
      ...LATEST_STATUS_VALIDATION,
    });
    report.updated.push(`collection ${VEHICLE_LATEST_STATUS} (validator)`);
  } else if (!report.created.includes(`collection ${VEHICLE_LATEST_STATUS}`)) {
    report.unchanged.push(`collection ${VEHICLE_LATEST_STATUS}`);
  }

  // indexes
  const wantedIndexes: [string, IndexSpec[]][] = [
    [TELEMETRY_READINGS, READINGS_INDEXES],
    [VEHICLE_LATEST_STATUS, LATEST_STATUS_INDEXES],
  ];
  for (const [collectionName, specs] of wantedIndexes) {
    const collection = db.collection(collectionName);
    const found = await listIndexes(db, collectionName);
    for (const spec of specs) {
      const label = `index ${collectionName}.${spec.name}`;
      const current = found.find((i) => i.name === spec.name);
      if (current) {
        if (!indexMatches(current, spec)) {
          throw new TelemetrySchemaError(
            `${label} exists with a different definition. Drop it manually and re-run setup.`,
          );
        }
        report.unchanged.push(label);
        continue;
      }
      try {
        await collection.createIndex(spec.key, {
          name: spec.name,
          ...(spec.unique ? { unique: true } : {}),
        });
      } catch (error) {
        if (hasCode(error, INDEX_OPTIONS_CONFLICT, INDEX_KEY_SPECS_CONFLICT)) {
          throw new TelemetrySchemaError(
            `${label} conflicts with an existing index: ${error.message}`,
          );
        }
        throw error;
      }
      report.created.push(label);
    }
  }

  return report;
}
