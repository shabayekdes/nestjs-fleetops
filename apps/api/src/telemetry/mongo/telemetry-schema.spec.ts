import type { CollectionInfo, IndexDescriptionInfo } from 'mongodb';
import {
  findSchemaProblems,
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
  key: Record<string, number>,
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

const goodIndexes = (): Record<string, IndexDescriptionInfo[]> => ({
  [TELEMETRY_READINGS]: [readingsIndex()],
  [VEHICLE_LATEST_STATUS]: [latestIndex()],
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
      [VEHICLE_LATEST_STATUS]: [latestIndex()],
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
      [VEHICLE_LATEST_STATUS]: [],
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
