import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { BatchTelemetryReadingsDto } from './batch-telemetry-readings.dto.js';
import { CreateTelemetryReadingDto } from './create-telemetry-reading.dto.js';
import { DailyQueryDto } from './daily-query.dto.js';
import { LatestListQueryDto } from './latest-list-query.dto.js';
import { ListReadingsQueryDto } from './list-readings-query.dto.js';
import { NearQueryDto } from './near-query.dto.js';
import { isIsoInstant } from './telemetry-validators.js';

type Plain = Record<string, unknown>;

const VEHICLE_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const MINUTE = 60_000;
const DAY = 86_400_000;

/** Flattens validation errors into dotted property paths. */
function paths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const own = e.constraints ? [path] : [];
    return [...own, ...paths(e.children ?? [], path)];
  });
}

/** Mirrors the global ValidationPipe (whitelist, forbidNonWhitelisted, transform). */
async function check<T extends object>(
  cls: new () => T,
  plain: Plain,
): Promise<{ instance: T; invalid: string[] }> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, invalid: paths(errors) };
}

const reading = (over: Plain = {}): Plain => ({
  vehicleId: VEHICLE_ID,
  timestamp: '2026-10-01T10:00:00.000Z',
  location: { latitude: 30, longitude: 31 },
  speedKph: 50,
  ...over,
});

describe('CreateTelemetryReadingDto', () => {
  it('accepts a minimal reading', async () => {
    expect((await check(CreateTelemetryReadingDto, reading())).invalid).toEqual(
      [],
    );
  });

  it('accepts a full reading', async () => {
    const full = reading({
      fuelLevelPercent: 55.5,
      odometerKm: 12345.6,
      engine: { on: true, rpm: 2000, coolantTempC: 90 },
    });
    expect((await check(CreateTelemetryReadingDto, full)).invalid).toEqual([]);
  });

  it.each(['vehicleId', 'timestamp', 'location', 'speedKph'])(
    'rejects a missing %s',
    async (field) => {
      const plain = reading();
      delete plain[field];
      expect((await check(CreateTelemetryReadingDto, plain)).invalid).toContain(
        field,
      );
    },
  );

  it.each(['latitude', 'longitude'])(
    'rejects a missing location.%s',
    async (field) => {
      const location: Plain = { latitude: 1, longitude: 1 };
      delete location[field];
      const { invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ location }),
      );
      expect(invalid).toContain(`location.${field}`);
    },
  );

  it('rejects an engine without "on"', async () => {
    const { invalid } = await check(
      CreateTelemetryReadingDto,
      reading({ engine: { rpm: 100 } }),
    );
    expect(invalid).toContain('engine.on');
  });

  it.each<[string, Plain, boolean]>([
    ['latitude 90', { location: { latitude: 90, longitude: 0 } }, true],
    ['latitude -90', { location: { latitude: -90, longitude: 0 } }, true],
    [
      'latitude 90.0001',
      { location: { latitude: 90.0001, longitude: 0 } },
      false,
    ],
    [
      'latitude -90.0001',
      { location: { latitude: -90.0001, longitude: 0 } },
      false,
    ],
    ['longitude 180', { location: { latitude: 0, longitude: 180 } }, true],
    ['longitude -180', { location: { latitude: 0, longitude: -180 } }, true],
    [
      'longitude -180.0001',
      { location: { latitude: 0, longitude: -180.0001 } },
      false,
    ],
    [
      'longitude 180.0001',
      { location: { latitude: 0, longitude: 180.0001 } },
      false,
    ],
    ['speed 0', { speedKph: 0 }, true],
    ['speed 300', { speedKph: 300 }, true],
    ['speed -0.1', { speedKph: -0.1 }, false],
    ['speed 300.1', { speedKph: 300.1 }, false],
    ['fuel 0', { fuelLevelPercent: 0 }, true],
    ['fuel 100', { fuelLevelPercent: 100 }, true],
    ['fuel -1', { fuelLevelPercent: -1 }, false],
    ['fuel 100.1', { fuelLevelPercent: 100.1 }, false],
    ['odometer 0', { odometerKm: 0 }, true],
    ['odometer 10000000', { odometerKm: 10_000_000 }, true],
    ['odometer -1', { odometerKm: -1 }, false],
    ['odometer 10000001', { odometerKm: 10_000_001 }, false],
    ['rpm 0', { engine: { on: true, rpm: 0 } }, true],
    ['rpm 10000', { engine: { on: true, rpm: 10_000 } }, true],
    ['rpm -1', { engine: { on: true, rpm: -1 } }, false],
    ['rpm 10001', { engine: { on: true, rpm: 10_001 } }, false],
    ['rpm 1.5 (not an integer)', { engine: { on: true, rpm: 1.5 } }, false],
    ['coolant -50', { engine: { on: true, coolantTempC: -50 } }, true],
    ['coolant 150', { engine: { on: true, coolantTempC: 150 } }, true],
    ['coolant -50.1', { engine: { on: true, coolantTempC: -50.1 } }, false],
    ['coolant 150.1', { engine: { on: true, coolantTempC: 150.1 } }, false],
  ])('bound: %s', async (_name, over, ok) => {
    const { invalid } = await check(CreateTelemetryReadingDto, reading(over));
    expect(invalid.length === 0).toBe(ok);
  });

  it('rejects non-finite and non-numeric numbers', async () => {
    for (const speedKph of [Number.NaN, Number.POSITIVE_INFINITY, '50', null]) {
      const { invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ speedKph }),
      );
      expect(invalid).toContain('speedKph');
    }
  });

  it('names the nested path of an invalid latitude inside a batch', async () => {
    const readings = [0, 1, 2, 3, 4].map((i) =>
      reading(i === 3 ? { location: { latitude: 91, longitude: 0 } } : {}),
    );
    const { invalid } = await check(BatchTelemetryReadingsDto, { readings });
    expect(invalid).toEqual(['readings.3.location.latitude']);
  });

  describe('timestamp', () => {
    const ts = (value: unknown) =>
      check(CreateTelemetryReadingDto, reading({ timestamp: value }));

    it.each([
      '2026-10-01T10:00:00',
      '2026-10-01 10:00:00Z',
      '2026-10-01',
      '2026-10-01T10:00Z',
      'not-a-date',
      '2026-13-01T10:00:00Z',
      '2026-10-01T10:00:00.1234567890Z',
      '',
      123456789,
      null,
    ])('rejects %p', async (value) => {
      expect((await ts(value)).invalid).toContain('timestamp');
    });

    it.each([
      '2026-10-01T10:00:00Z',
      '2026-10-01T10:00:00.123Z',
      '2026-10-01T10:00:00.123456789Z',
      '2026-10-01T10:00:00+02:00',
      '2026-10-01T10:00:00-05:30',
    ])('accepts %p', async (value) => {
      expect((await ts(value)).invalid).toEqual([]);
    });

    it.each([
      '2026-02-30T00:00:00Z',
      '2026-04-31T00:00:00Z',
      '2026-02-29T00:00:00Z',
      '2026-00-10T00:00:00Z',
      '2026-10-00T00:00:00Z',
      '2026-10-01T24:00:00Z',
      '2026-10-01T10:60:00Z',
      '2026-10-01T10:00:60Z',
      '2026-10-01T10:00:00+24:00',
      '2026-10-01T10:00:00+02:60',
    ])('rejects the impossible instant %p', async (value) => {
      expect((await ts(value)).invalid).toContain('timestamp');
      expect(isIsoInstant(value)).toBe(false);
    });

    it.each([
      '2028-02-29T00:00:00Z',
      '2024-02-29T23:59:59Z',
      '2000-02-29T00:00:00Z',
      '2026-04-30T23:59:59.999Z',
    ])('accepts the real calendar instant %p', (value) => {
      expect(isIsoInstant(value)).toBe(true);
    });

    it('rejects 1900-02-29 (not a leap year) and accepts 1904-02-29', () => {
      expect(isIsoInstant('1900-02-29T00:00:00Z')).toBe(false);
      expect(isIsoInstant('1904-02-29T00:00:00Z')).toBe(true);
    });

    it('accepts up to 5 minutes in the future (+4 min) and rejects +6 min', async () => {
      const ok = new Date(Date.now() + 4 * MINUTE).toISOString();
      const bad = new Date(Date.now() + 6 * MINUTE).toISOString();
      expect((await ts(ok)).invalid).toEqual([]);
      expect((await ts(bad)).invalid).toContain('timestamp');
    });
  });

  describe('vehicleId and unexpected input', () => {
    it('rejects a non-v7 UUID', async () => {
      const v4 = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
      const { invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ vehicleId: v4 }),
      );
      expect(invalid).toContain('vehicleId');
    });

    it('lowercases an uppercase vehicleId', async () => {
      const { instance, invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ vehicleId: VEHICLE_ID.toUpperCase() }),
      );
      expect(invalid).toEqual([]);
      expect(instance.vehicleId).toBe(VEHICLE_ID);
    });

    it('rejects organizationId in the body', async () => {
      const { invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ organizationId: VEHICLE_ID }),
      );
      expect(invalid).toContain('organizationId');
    });

    it('rejects unknown nested fields', async () => {
      const { invalid } = await check(
        CreateTelemetryReadingDto,
        reading({ location: { latitude: 1, longitude: 1, altitude: 3 } }),
      );
      expect(invalid).toContain('location.altitude');
    });
  });
});

describe('BatchTelemetryReadingsDto', () => {
  const batch = (n: number) => ({
    readings: Array.from({ length: n }, () => reading()),
  });

  it.each<[number, boolean]>([
    [0, false],
    [1, true],
    [200, true],
    [201, false],
  ])('size %i valid=%s', async (n, ok) => {
    const { invalid } = await check(BatchTelemetryReadingsDto, batch(n));
    expect(invalid.length === 0).toBe(ok);
  });

  it('rejects a missing or non-array readings', async () => {
    expect((await check(BatchTelemetryReadingsDto, {})).invalid).toContain(
      'readings',
    );
    expect(
      (await check(BatchTelemetryReadingsDto, { readings: 'x' })).invalid,
    ).toContain('readings');
  });
});

describe('ListReadingsQueryDto', () => {
  const FROM = '2026-10-01T00:00:00.000Z';
  const q = (over: Plain = {}): Plain => ({
    from: FROM,
    to: '2026-10-02T00:00:00.000Z',
    ...over,
  });
  const iso = (ms: number) => new Date(Date.parse(FROM) + ms).toISOString();

  it('accepts a valid query and applies the default limit', async () => {
    const { instance, invalid } = await check(ListReadingsQueryDto, q());
    expect(invalid).toEqual([]);
    expect(instance.limit).toBe(100);
  });

  it.each(['from', 'to'])('rejects a missing %s', async (field) => {
    const plain = q();
    delete plain[field];
    expect((await check(ListReadingsQueryDto, plain)).invalid).toContain(field);
  });

  it('rejects to equal to from and to before from', async () => {
    expect(
      (await check(ListReadingsQueryDto, q({ to: FROM }))).invalid,
    ).toContain('to');
    expect(
      (await check(ListReadingsQueryDto, q({ to: iso(-1) }))).invalid,
    ).toContain('to');
  });

  it('accepts exactly 7 days and rejects 7 days + 1 ms', async () => {
    expect(
      (await check(ListReadingsQueryDto, q({ to: iso(7 * DAY) }))).invalid,
    ).toEqual([]);
    expect(
      (await check(ListReadingsQueryDto, q({ to: iso(7 * DAY + 1) }))).invalid,
    ).toContain('to');
  });

  it('rejects timestamps without an offset and a bad cursor', async () => {
    expect(
      (await check(ListReadingsQueryDto, q({ from: '2026-10-01T00:00:00' })))
        .invalid,
    ).toContain('from');
    expect(
      (await check(ListReadingsQueryDto, q({ before: 'yesterday' }))).invalid,
    ).toContain('before');
  });

  it.each<[string, boolean]>([
    ['0', false],
    ['1', true],
    ['1000', true],
    ['1001', false],
    ['abc', false],
    ['1.5', false],
  ])('limit %s valid=%s', async (limit, ok) => {
    const { invalid } = await check(ListReadingsQueryDto, q({ limit }));
    expect(invalid.length === 0).toBe(ok);
  });

  it('rejects unknown query parameters', async () => {
    expect(
      (await check(ListReadingsQueryDto, q({ organizationId: 'x' }))).invalid,
    ).toContain('organizationId');
  });
});

describe('LatestListQueryDto', () => {
  it('defaults the limit to 50', async () => {
    const { instance, invalid } = await check(LatestListQueryDto, {});
    expect(invalid).toEqual([]);
    expect(instance.limit).toBe(50);
  });

  it.each<[string, boolean]>([
    ['0', false],
    ['1', true],
    ['100', true],
    ['101', false],
  ])('limit %s valid=%s', async (limit, ok) => {
    const { invalid } = await check(LatestListQueryDto, { limit });
    expect(invalid.length === 0).toBe(ok);
  });

  it('validates and lowercases the after cursor', async () => {
    const good = await check(LatestListQueryDto, {
      after: VEHICLE_ID.toUpperCase(),
    });
    expect(good.invalid).toEqual([]);
    expect(good.instance.after).toBe(VEHICLE_ID);
    expect(
      (await check(LatestListQueryDto, { after: 'nope' })).invalid,
    ).toContain('after');
  });
});

describe('DailyQueryDto', () => {
  const q = (over: Plain = {}): Plain => ({
    from: '2026-01-01',
    to: '2026-01-31',
    ...over,
  });

  it('accepts a valid query and defaults timezone to UTC', async () => {
    const { instance, invalid } = await check(DailyQueryDto, q());
    expect(invalid).toEqual([]);
    expect(instance.timezone).toBe('UTC');
  });

  it.each(['2026-1-01', '2026-02-30', '20260101', '2026-01-01T00:00:00Z', ''])(
    'rejects date %p',
    async (value) => {
      expect(
        (await check(DailyQueryDto, q({ from: value }))).invalid,
      ).toContain('from');
    },
  );

  it('accepts to == from and rejects to < from', async () => {
    expect(
      (await check(DailyQueryDto, q({ to: '2026-01-01' }))).invalid,
    ).toEqual([]);
    expect(
      (await check(DailyQueryDto, q({ to: '2025-12-31' }))).invalid,
    ).toContain('to');
  });

  it('allows an inclusive 31-day range and rejects 32 days', async () => {
    expect(
      (await check(DailyQueryDto, q({ to: '2026-01-31' }))).invalid,
    ).toEqual([]);
    expect(
      (await check(DailyQueryDto, q({ to: '2026-02-01' }))).invalid,
    ).toContain('to');
  });

  it.each(['UTC', 'Africa/Cairo', 'America/New_York', 'Etc/GMT+3'])(
    'accepts timezone %s',
    async (timezone) => {
      expect((await check(DailyQueryDto, q({ timezone }))).invalid).toEqual([]);
    },
  );

  it.each(['+03:00', 'Mars/Base', '', 'Cairo', 'utc', 'Africa/'])(
    'rejects timezone %p',
    async (timezone) => {
      expect((await check(DailyQueryDto, q({ timezone }))).invalid).toContain(
        'timezone',
      );
    },
  );
});

describe('NearQueryDto', () => {
  const q = (over: Plain = {}): Plain => ({
    latitude: '30',
    longitude: '31',
    ...over,
  });

  it('applies defaults and converts strings to numbers', async () => {
    const { instance, invalid } = await check(NearQueryDto, q());
    expect(invalid).toEqual([]);
    expect(instance).toMatchObject({
      latitude: 30,
      longitude: 31,
      radiusMeters: 5000,
      limit: 10,
    });
  });

  it.each(['latitude', 'longitude'])('rejects a missing %s', async (field) => {
    const plain = q();
    delete plain[field];
    expect((await check(NearQueryDto, plain)).invalid).toContain(field);
  });

  it.each<[Plain, boolean]>([
    [{ latitude: '90' }, true],
    [{ latitude: '90.0001' }, false],
    [{ latitude: '-90.0001' }, false],
    [{ longitude: '-180' }, true],
    [{ longitude: '180.0001' }, false],
    [{ radiusMeters: '1' }, true],
    [{ radiusMeters: '0.5' }, false],
    [{ radiusMeters: '0' }, false],
    [{ radiusMeters: '50000' }, true],
    [{ radiusMeters: '50001' }, false],
    [{ limit: '1' }, true],
    [{ limit: '50' }, true],
    [{ limit: '0' }, false],
    [{ limit: '51' }, false],
  ])('bounds %j valid=%s', async (over, ok) => {
    const { invalid } = await check(NearQueryDto, q(over));
    expect(invalid.length === 0).toBe(ok);
  });

  it.each(['latitude', 'longitude', 'radiusMeters'])(
    'rejects a blank or non-numeric %s',
    async (field) => {
      for (const value of ['', '   ', 'abc']) {
        const { invalid } = await check(NearQueryDto, q({ [field]: value }));
        expect(invalid).toContain(field);
      }
    },
  );
});
