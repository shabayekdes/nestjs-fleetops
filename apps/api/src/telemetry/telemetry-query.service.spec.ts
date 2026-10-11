import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { DailyQueryDto } from './dto/daily-query.dto.js';
import type { ListReadingsQueryDto } from './dto/list-readings-query.dto.js';
import type { NearQueryDto } from './dto/near-query.dto.js';
import { TelemetryQueryService } from './telemetry-query.service.js';
import type { VehicleDirectory } from './vehicle-directory.port.js';

const ORG = '01890a5d-ac96-774b-bcce-b302099a8000';
const V1 = '01890a5d-ac96-774b-bcce-b302099a8001';
const user = { organizationId: ORG } as unknown as AuthUser;

type Fn = (...args: unknown[]) => unknown;

const latestDoc = (vehicleId: string, extra: Record<string, unknown> = {}) => ({
  organizationId: ORG,
  vehicleId,
  timestamp: new Date('2026-10-01T10:00:00Z'),
  location: { type: 'Point', coordinates: [31, 30] },
  speedKph: 10,
  receivedAt: new Date('2026-10-01T10:00:01Z'),
  updatedAt: new Date('2026-10-01T10:00:02Z'),
  ...extra,
});

const readingDoc = (ts: string) => ({
  timestamp: new Date(ts),
  meta: { organizationId: ORG, vehicleId: V1 },
  location: { type: 'Point', coordinates: [31, 30] },
  speedKph: 10,
  receivedAt: new Date(ts),
});

describe('TelemetryQueryService', () => {
  const toArray = jest.fn<() => Promise<unknown[]>>();
  const limit = jest.fn<Fn>();
  const sort = jest.fn<Fn>();
  const find = jest.fn<Fn>();
  const aggregate = jest.fn<Fn>();
  const findOne = jest.fn<() => Promise<unknown>>();
  const readingsAggregate = jest.fn<Fn>();
  const existing = jest.fn<VehicleDirectory['existingVehicleIds']>();
  let service: TelemetryQueryService;

  beforeEach(() => {
    jest.resetAllMocks();
    const cursor = { sort, limit, toArray };
    sort.mockReturnValue(cursor);
    limit.mockReturnValue(cursor);
    find.mockReturnValue(cursor);
    aggregate.mockReturnValue({ toArray });
    readingsAggregate.mockReturnValue({ toArray });
    toArray.mockResolvedValue([]);
    existing.mockResolvedValue(new Set([V1]));
    service = new TelemetryQueryService(
      { find, aggregate: readingsAggregate } as never,
      { find, findOne, aggregate } as never,
      { existingVehicleIds: existing },
    );
  });

  const readingsQuery = (over: Partial<ListReadingsQueryDto> = {}) => ({
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-02T00:00:00.000Z',
    limit: 100,
    ...over,
  });

  describe('unknown vehicle', () => {
    it.each([
      ['findReadings', () => service.findReadings(user, V1, readingsQuery())],
      ['findLatest', () => service.findLatest(user, V1)],
      [
        'findDaily',
        () =>
          service.findDaily(user, V1, {
            from: '2026-10-01',
            to: '2026-10-02',
            timezone: 'UTC',
          }),
      ],
    ])('%s throws 404 before any Mongo call', async (_n, run) => {
      existing.mockResolvedValue(new Set());
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(find).not.toHaveBeenCalled();
      expect(findOne).not.toHaveBeenCalled();
      expect(aggregate).not.toHaveBeenCalled();
      expect(readingsAggregate).not.toHaveBeenCalled();
    });

    it('checks the directory with the user organization and lowercased id', async () => {
      await service.findLatest(user, V1.toUpperCase()).catch(() => undefined);
      expect(existing).toHaveBeenCalledWith(ORG, [V1]);
    });
  });

  describe('findReadings', () => {
    it('filters by the user organization, vehicle and window, newest first', async () => {
      await service.findReadings(user, V1.toUpperCase(), readingsQuery());

      expect(find.mock.calls[0][0]).toEqual({
        'meta.organizationId': ORG,
        'meta.vehicleId': V1,
        timestamp: {
          $gte: new Date('2026-10-01T00:00:00.000Z'),
          $lte: new Date('2026-10-02T00:00:00.000Z'),
        },
      });
      expect(sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(limit).toHaveBeenCalledWith(100);
    });

    it('uses $lt before when the cursor is at or before to', async () => {
      await service.findReadings(
        user,
        V1,
        readingsQuery({ before: '2026-10-01T12:00:00.000Z' }),
      );
      const filter = find.mock.calls[0][0] as { timestamp: object };
      expect(filter.timestamp).toEqual({
        $gte: new Date('2026-10-01T00:00:00.000Z'),
        $lt: new Date('2026-10-01T12:00:00.000Z'),
      });
    });

    it('uses $lt when before equals to', async () => {
      await service.findReadings(
        user,
        V1,
        readingsQuery({ before: '2026-10-02T00:00:00.000Z' }),
      );
      const filter = find.mock.calls[0][0] as { timestamp: object };
      expect(filter.timestamp).toHaveProperty('$lt');
      expect(filter.timestamp).not.toHaveProperty('$lte');
    });

    it('keeps $lte to when before is later than to', async () => {
      await service.findReadings(
        user,
        V1,
        readingsQuery({ before: '2026-10-05T00:00:00.000Z' }),
      );
      const filter = find.mock.calls[0][0] as { timestamp: object };
      expect(filter.timestamp).toHaveProperty('$lte');
      expect(filter.timestamp).not.toHaveProperty('$lt');
    });

    it('returns a null cursor on a short page and the last timestamp on a full one', async () => {
      toArray.mockResolvedValueOnce([readingDoc('2026-10-01T10:00:00.000Z')]);
      const short = await service.findReadings(
        user,
        V1,
        readingsQuery({ limit: 2 }),
      );
      expect(short.meta).toEqual({ limit: 2, nextCursor: null });

      toArray.mockResolvedValueOnce([
        readingDoc('2026-10-01T10:00:00.000Z'),
        readingDoc('2026-10-01T09:00:00.000Z'),
      ]);
      const full = await service.findReadings(
        user,
        V1,
        readingsQuery({ limit: 2 }),
      );
      expect(full.meta.nextCursor).toBe('2026-10-01T09:00:00.000Z');
    });

    it('returns an empty page with a null cursor', async () => {
      const out = await service.findReadings(user, V1, readingsQuery());
      expect(out).toEqual({ data: [], meta: { limit: 100, nextCursor: null } });
    });
  });

  describe('findLatest', () => {
    it('throws 404 with a distinct message when there is no telemetry yet', async () => {
      findOne.mockResolvedValue(null);
      await expect(service.findLatest(user, V1)).rejects.toThrow(
        'No telemetry for this vehicle yet',
      );
    });

    it('scopes the lookup to the organization and returns updatedAt', async () => {
      findOne.mockResolvedValue(latestDoc(V1));
      const out = await service.findLatest(user, V1);
      expect((findOne.mock.calls[0] as unknown[])[0]).toEqual({
        organizationId: ORG,
        vehicleId: V1,
      });
      expect(out.updatedAt).toEqual(new Date('2026-10-01T10:00:02Z'));
    });
  });

  describe('listLatest', () => {
    it('filters by organization, sorts by vehicleId and paginates by cursor', async () => {
      toArray.mockResolvedValue([latestDoc(V1)]);
      const out = await service.listLatest(user, { after: V1, limit: 1 });

      expect(find.mock.calls[0][0]).toEqual({
        organizationId: ORG,
        vehicleId: { $gt: V1 },
      });
      expect(sort).toHaveBeenCalledWith({ vehicleId: 1 });
      expect(out.meta).toEqual({ limit: 1, nextCursor: V1 });
    });

    it('omits the vehicleId filter without a cursor and ends with a null cursor', async () => {
      const out = await service.listLatest(user, { limit: 50 });
      expect(find.mock.calls[0][0]).toEqual({ organizationId: ORG });
      expect(out.meta.nextCursor).toBeNull();
    });
  });

  describe('findNear', () => {
    const near = (over: Partial<NearQueryDto> = {}) => ({
      latitude: 30,
      longitude: 31,
      radiusMeters: 1000,
      limit: 5,
      ...over,
    });

    it('starts with $geoNear scoped to the organization on key location', async () => {
      await service.findNear(user, near());
      const pipeline = aggregate.mock.calls[0][0] as Record<string, unknown>[];
      expect(Object.keys(pipeline[0])).toEqual(['$geoNear']);
      expect(pipeline[0].$geoNear).toEqual({
        near: { type: 'Point', coordinates: [31, 30] },
        key: 'location',
        distanceField: 'distanceMeters',
        maxDistance: 1000,
        query: { organizationId: ORG },
        spherical: true,
      });
      expect(pipeline[1]).toEqual({ $limit: 5 });
    });

    it('rounds distanceMeters to 0.1 and keeps the latest fields', async () => {
      toArray.mockResolvedValue([latestDoc(V1, { distanceMeters: 12.3456 })]);
      const out = await service.findNear(user, near());
      expect(out.data[0].distanceMeters).toBe(12.3);
      expect(out.data[0].updatedAt).toBeInstanceOf(Date);
      expect(out.data[0].location).toEqual({ latitude: 30, longitude: 31 });
    });
  });

  describe('findDaily', () => {
    const daily = (over: Partial<DailyQueryDto> = {}) => ({
      from: '2026-10-30',
      to: '2026-10-31',
      timezone: 'Africa/Cairo',
      ...over,
    });

    it('starts with a $match on the organization and a widened UTC window', async () => {
      await service.findDaily(user, V1, daily());
      const pipeline = readingsAggregate.mock.calls[0][0] as Record<
        string,
        Record<string, unknown>
      >[];
      expect(pipeline[0].$match).toEqual({
        'meta.organizationId': ORG,
        'meta.vehicleId': V1,
        timestamp: {
          $gte: new Date('2026-10-29T00:00:00.000Z'),
          $lt: new Date('2026-11-02T00:00:00.000Z'),
        },
      });
    });

    it('passes the time zone to $dateToString and filters local days after grouping', async () => {
      await service.findDaily(user, V1, daily());
      const pipeline = readingsAggregate.mock.calls[0][0] as Record<
        string,
        Record<string, unknown>
      >[];
      const id = pipeline[1].$group._id as {
        $dateToString: { timezone: string; format: string };
      };
      expect(id.$dateToString.timezone).toBe('Africa/Cairo');
      expect(id.$dateToString.format).toBe('%Y-%m-%d');
      expect(pipeline[2].$match).toEqual({
        _id: { $gte: '2026-10-30', $lte: '2026-10-31' },
      });
    });

    it('echoes the request shape in the response', async () => {
      toArray.mockResolvedValue([{ date: '2026-10-30', readings: 1 }]);
      const out = await service.findDaily(user, V1.toUpperCase(), daily());
      expect(out).toMatchObject({
        vehicleId: V1,
        timezone: 'Africa/Cairo',
        from: '2026-10-30',
        to: '2026-10-31',
        data: [{ date: '2026-10-30', readings: 1 }],
      });
    });
  });
});
