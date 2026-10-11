import type { CollectionInfo, IndexDescriptionInfo } from 'mongodb';
import {
  findSchemaProblems,
  LATEST_STATUS_VALIDATOR,
  READINGS_RETIRED_INDEXES,
  TELEMETRY_READINGS,
  telemetryReadingsOptions,
  VEHICLE_LATEST_STATUS,
} from './telemetry-schema.js';

const readings = (over: Record<string, unknown> = {}): CollectionInfo => ({
  name: TELEMETRY_READINGS,
  type: 'timeseries',
  options: {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'meta',
      granularity: 'seconds',
      ...over,
    },
    expireAfterSeconds: 2592000,
  },
});

const latest = (): CollectionInfo => ({
  name: VEHICLE_LATEST_STATUS,
  type: 'collection',
  options: {},
});

const idx = (
  name: string,
  key: Record<string, 1 | -1 | '2dsphere'>,
  unique?: boolean,
): IndexDescriptionInfo => ({ v: 2, name, key, ...(unique ? { unique } : {}) });

const readingsIndex = () =>
  idx('org_vehicle_timestamp', {
    'meta.organizationId': 1,
    'meta.vehicleId': 1,
    timestamp: -1,
  });
const latestIndex = () =>
  idx('org_vehicle_unique', { organizationId: 1, vehicleId: 1 }, true);

const geoIndex = () =>
  idx('org_location_2dsphere', { organizationId: 1, location: '2dsphere' });

const goodIndexes = (): Record<string, IndexDescriptionInfo[]> => ({
  [TELEMETRY_READINGS]: [readingsIndex()],
  [VEHICLE_LATEST_STATUS]: [latestIndex(), geoIndex()],
});

describe('telemetryReadingsOptions', () => {
  it('builds time series options and converts days to seconds', () => {
    expect(telemetryReadingsOptions(30)).toEqual({
      timeseries: {
        timeField: 'timestamp',
        metaField: 'meta',
        granularity: 'seconds',
      },
      expireAfterSeconds: 2592000,
    });
  });
});

describe('findSchemaProblems', () => {
  it('returns no problems for a complete schema', () => {
    expect(findSchemaProblems([readings(), latest()], goodIndexes())).toEqual(
      [],
    );
  });

  it('reports a missing readings collection', () => {
    const problems = findSchemaProblems([latest()], {
      [VEHICLE_LATEST_STATUS]: [latestIndex(), geoIndex()],
    });
    expect(problems).toEqual([`collection ${TELEMETRY_READINGS} is missing`]);
  });

  it('reports a missing latest status collection', () => {
    const problems = findSchemaProblems([readings()], {
      [TELEMETRY_READINGS]: [readingsIndex()],
    });
    expect(problems).toEqual([
      `collection ${VEHICLE_LATEST_STATUS} is missing`,
    ]);
  });

  it('reports everything missing on an empty database', () => {
    expect(findSchemaProblems([], {})).toHaveLength(2);
  });

  it.each(['view', 'timeseries'])(
    'reports latest status that is a %s',
    (type) => {
      const wrong = { ...latest(), type };
      const problems = findSchemaProblems([readings(), wrong], goodIndexes());
      expect(problems).toEqual([
        `collection ${VEHICLE_LATEST_STATUS} is a ${type}, expected a plain collection`,
      ]);
    },
  );

  it('reports readings that is a plain collection', () => {
    const plain = { name: TELEMETRY_READINGS, type: 'collection', options: {} };
    const problems = findSchemaProblems([plain, latest()], goodIndexes());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('not a time series');
  });

  it.each([
    ['timeField', 'ts'],
    ['metaField', 'tags'],
    ['granularity', 'minutes'],
  ])('reports a wrong %s', (field, value) => {
    const problems = findSchemaProblems(
      [readings({ [field]: value }), latest()],
      goodIndexes(),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('not a time series');
  });

  it('reports a missing readings index', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [TELEMETRY_READINGS]: [
        idx('meta_1_timestamp_1', { meta: 1, timestamp: 1 }),
      ],
    });
    expect(problems).toEqual([
      `index ${TELEMETRY_READINGS}.org_vehicle_timestamp is missing`,
    ]);
  });

  it('reports a missing latest status index', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [VEHICLE_LATEST_STATUS]: [geoIndex()],
    });
    expect(problems).toEqual([
      `index ${VEHICLE_LATEST_STATUS}.org_vehicle_unique is missing`,
    ]);
  });

  it('reports the same index name with different keys', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [TELEMETRY_READINGS]: [
        idx('org_vehicle_timestamp', {
          'meta.organizationId': 1,
          timestamp: -1,
        }),
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('different definition');
  });

  it('reports the same index with different key order', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [TELEMETRY_READINGS]: [
        idx('org_vehicle_timestamp', {
          'meta.vehicleId': 1,
          'meta.organizationId': 1,
          timestamp: -1,
        }),
      ],
    });
    expect(problems).toHaveLength(1);
  });

  it('reports a missing unique flag', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [VEHICLE_LATEST_STATUS]: [
        idx('org_vehicle_unique', { organizationId: 1, vehicleId: 1 }),
        geoIndex(),
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('different definition');
  });

  it('ignores extra indexes such as the automatic meta_1_timestamp_1', () => {
    const indexes = goodIndexes();
    indexes[TELEMETRY_READINGS].push(
      idx('meta_1_timestamp_1', { meta: 1, timestamp: 1 }),
    );
    expect(findSchemaProblems([readings(), latest()], indexes)).toEqual([]);
  });

  it('does not treat a retention difference as a problem', () => {
    const drifted = readings();
    (drifted.options as Record<string, unknown>).expireAfterSeconds = 60;
    expect(findSchemaProblems([drifted, latest()], goodIndexes())).toEqual([]);
  });
});

describe('L8 schema additions', () => {
  it('requires the organization 2dsphere index on latest status', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [VEHICLE_LATEST_STATUS]: [latestIndex()],
    });
    expect(problems).toEqual([
      `index ${VEHICLE_LATEST_STATUS}.org_location_2dsphere is missing`,
    ]);
  });

  it('reports a 2dsphere index with a different key', () => {
    const problems = findSchemaProblems([readings(), latest()], {
      ...goodIndexes(),
      [VEHICLE_LATEST_STATUS]: [
        latestIndex(),
        idx('org_location_2dsphere', { location: '2dsphere' }),
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('different definition');
  });

  it('does not treat a present retired index as a problem', () => {
    expect(READINGS_RETIRED_INDEXES).toEqual(['meta_1_timestamp_1']);
    const indexes = goodIndexes();
    for (const name of READINGS_RETIRED_INDEXES) {
      indexes[TELEMETRY_READINGS].push(idx(name, { meta: 1, timestamp: 1 }));
    }
    expect(findSchemaProblems([readings(), latest()], indexes)).toEqual([]);
  });

  describe('LATEST_STATUS_VALIDATOR', () => {
    const schema = LATEST_STATUS_VALIDATOR.$jsonSchema as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, Record<string, unknown>>;
    };

    it('is closed and requires the full reading copy', () => {
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(
        [
          'location',
          'organizationId',
          'receivedAt',
          'speedKph',
          'timestamp',
          'updatedAt',
          'vehicleId',
        ].sort(),
      );
      expect(Object.keys(schema.properties).sort()).toEqual(
        [
          '_id',
          'engine',
          'fuelLevelPercent',
          'location',
          'odometerKm',
          'organizationId',
          'receivedAt',
          'speedKph',
          'timestamp',
          'updatedAt',
          'vehicleId',
        ].sort(),
      );
    });

    it('bounds the measurements', () => {
      expect(schema.properties.speedKph).toMatchObject({
        minimum: 0,
        maximum: 300,
      });
      expect(schema.properties.fuelLevelPercent).toMatchObject({
        minimum: 0,
        maximum: 100,
      });
      expect(schema.properties.odometerKm).toMatchObject({ minimum: 0 });
      const engine = schema.properties.engine as {
        required: string[];
        additionalProperties: boolean;
        properties: Record<string, unknown>;
      };
      expect(engine.required).toEqual(['on']);
      expect(engine.additionalProperties).toBe(false);
      expect(engine.properties.rpm).toMatchObject({
        minimum: 0,
        maximum: 10000,
      });
      expect(engine.properties.coolantTempC).toMatchObject({
        minimum: -50,
        maximum: 150,
      });
    });
  });
});
