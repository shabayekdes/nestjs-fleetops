import { jest } from '@jest/globals';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MongoBulkWriteError, MongoServerSelectionError } from 'mongodb';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateTelemetryReadingDto } from './dto/create-telemetry-reading.dto.js';
import { TelemetryIngestionService } from './telemetry-ingestion.service.js';
import type { VehicleDirectory } from './vehicle-directory.port.js';

const ORG = '01890a5d-ac96-774b-bcce-b302099a8000';
const V1 = '01890a5d-ac96-774b-bcce-b302099a8001';
const V2 = '01890a5d-ac96-774b-bcce-b302099a8002';
const V3 = '01890a5d-ac96-774b-bcce-b302099a8003';
const user = { organizationId: ORG } as unknown as AuthUser;

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

const reading = (
  vehicleId: string,
  timestamp = minutesAgo(1),
): CreateTelemetryReadingDto => ({
  vehicleId,
  timestamp,
  location: { latitude: 30, longitude: 31 },
  speedKph: 10,
});

type Fn = (...args: unknown[]) => Promise<unknown>;

function bulkError(
  writeErrors: { index: number; code: number }[],
  insertedCount: number,
): MongoBulkWriteError {
  const error = Object.create(
    MongoBulkWriteError.prototype,
  ) as MongoBulkWriteError;
  Object.defineProperties(error, {
    writeErrors: { value: writeErrors },
    insertedCount: { value: insertedCount },
    message: { value: 'bulk' },
  });
  return error;
}

describe('TelemetryIngestionService', () => {
  const insertOne = jest.fn<Fn>();
  const insertMany = jest.fn<Fn>();
  const bulkWrite = jest.fn<Fn>();
  const existing = jest.fn<VehicleDirectory['existingVehicleIds']>();
  const config = {
    get: jest.fn(() => 30),
  } as unknown as ConfigService<never, true>;

  let service: TelemetryIngestionService;
  let logError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    jest.resetAllMocks();
    (config.get as jest.Mock).mockReturnValue(30);
    insertOne.mockResolvedValue({});
    insertMany.mockResolvedValue({});
    bulkWrite.mockResolvedValue({});
    service = new TelemetryIngestionService(
      { insertOne, insertMany } as never,
      { bulkWrite } as never,
      { existingVehicleIds: existing },
      config,
    );
    logError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('ingestOne', () => {
    it('throws 404 and inserts nothing for an unknown vehicle', async () => {
      existing.mockResolvedValue(new Set());
      await expect(service.ingestOne(user, reading(V1))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(insertOne).not.toHaveBeenCalled();
      expect(bulkWrite).not.toHaveBeenCalled();
    });

    it('checks the vehicle (404) before retention (422)', async () => {
      existing.mockResolvedValue(new Set());
      await expect(
        service.ingestOne(user, reading(V1, '2000-01-01T00:00:00Z')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 422 for a reading older than the retention period', async () => {
      existing.mockResolvedValue(new Set([V1]));
      const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
      await expect(
        service.ingestOne(user, reading(V1, old)),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(insertOne).not.toHaveBeenCalled();
    });

    it('stores the reading with organizationId from the user and returns the response', async () => {
      existing.mockResolvedValue(new Set([V1]));
      const out = await service.ingestOne(user, reading(V1.toUpperCase()));

      expect(existing).toHaveBeenCalledWith(ORG, [V1]);
      const stored = insertOne.mock.calls[0][0] as {
        meta: unknown;
      };
      expect(stored.meta).toEqual({ organizationId: ORG, vehicleId: V1 });
      expect(out.vehicleId).toBe(V1);
      expect(JSON.stringify(out)).not.toContain(ORG);
    });

    it('updates latest with a guarded replaceOne (timestamp $lt, upsert)', async () => {
      existing.mockResolvedValue(new Set([V1]));
      const ts = minutesAgo(2);
      await service.ingestOne(user, reading(V1, ts));

      const ops = bulkWrite.mock.calls[0][0] as {
        replaceOne: { filter: unknown; upsert: boolean };
      }[];
      expect(ops).toHaveLength(1);
      expect(ops[0].replaceOne.filter).toEqual({
        organizationId: ORG,
        vehicleId: V1,
        timestamp: { $lt: new Date(ts) },
      });
      expect(ops[0].replaceOne.upsert).toBe(true);
      expect(bulkWrite.mock.calls[0][1]).toEqual({ ordered: false });
    });

    it('maps a Mongo outage on insert to 503 and skips latest', async () => {
      existing.mockResolvedValue(new Set([V1]));
      insertOne.mockRejectedValue(
        new MongoServerSelectionError('down', new Map() as never),
      );
      await expect(service.ingestOne(user, reading(V1))).rejects.toMatchObject({
        status: 503,
      });
      expect(bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('ingestBatch', () => {
    it('queries the directory once with all ids, lowercased', async () => {
      existing.mockResolvedValue(new Set([V1, V2]));
      await service.ingestBatch(user, {
        readings: [reading(V1), reading(V2), reading(V1.toUpperCase())],
      });
      expect(existing).toHaveBeenCalledTimes(1);
      expect(existing).toHaveBeenCalledWith(ORG, [V1, V2, V1]);
    });

    it('rejects unknown and too-old readings with their original indexes', async () => {
      existing.mockResolvedValue(new Set([V1, V2]));
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
      const out = await service.ingestBatch(user, {
        readings: [reading(V1), reading(V3), reading(V2, old), reading(V2)],
      });

      expect(out).toEqual({
        accepted: 2,
        rejected: [
          { index: 1, vehicleId: V3, reason: 'VEHICLE_NOT_FOUND' },
          { index: 2, vehicleId: V2, reason: 'TOO_OLD' },
        ],
      });
      const docs = insertMany.mock.calls[0][0] as unknown[];
      expect(docs).toHaveLength(2);
      expect(insertMany.mock.calls[0][1]).toEqual({ ordered: false });
    });

    it('reports an unknown vehicle before too old when both apply', async () => {
      existing.mockResolvedValue(new Set());
      const out = await service.ingestBatch(user, {
        readings: [reading(V1, '2000-01-01T00:00:00Z')],
      });
      expect(out.rejected[0].reason).toBe('VEHICLE_NOT_FOUND');
    });

    it('does not insert or update latest when everything is rejected', async () => {
      existing.mockResolvedValue(new Set());
      const out = await service.ingestBatch(user, {
        readings: [reading(V1), reading(V2)],
      });
      expect(out.accepted).toBe(0);
      expect(out.rejected).toHaveLength(2);
      expect(insertMany).not.toHaveBeenCalled();
      expect(bulkWrite).not.toHaveBeenCalled();
    });

    it('maps storage write errors to STORAGE_REJECTED at original indexes', async () => {
      existing.mockResolvedValue(new Set([V1, V2]));
      // Request: 0 ok, 1 unknown (V3), 2 storage-rejected, 3 ok.
      // Insert positions: 0 -> request 0, 1 -> request 2, 2 -> request 3.
      existing.mockResolvedValue(new Set([V1, V2]));
      insertMany.mockRejectedValue(bulkError([{ index: 1, code: 2 }], 2));

      const out = await service.ingestBatch(user, {
        readings: [
          reading(V1),
          reading(V3),
          reading(V2),
          reading(V1, minutesAgo(5)),
        ],
      });

      expect(out.accepted).toBe(2);
      expect(out.rejected).toEqual([
        { index: 1, vehicleId: V3, reason: 'VEHICLE_NOT_FOUND' },
        { index: 2, vehicleId: V2, reason: 'STORAGE_REJECTED' },
      ]);
      // Latest is updated from the stored readings only (V1, not V2).
      const ops = bulkWrite.mock.calls[0][0] as {
        replaceOne: { filter: { vehicleId: string } };
      }[];
      expect(ops.map((o) => o.replaceOne.filter.vehicleId)).toEqual([V1]);
    });

    it('rethrows a non-bulk error (mapped to 503 when known)', async () => {
      existing.mockResolvedValue(new Set([V1]));
      insertMany.mockRejectedValue(
        new MongoServerSelectionError('down', new Map() as never),
      );
      await expect(
        service.ingestBatch(user, { readings: [reading(V1)] }),
      ).rejects.toMatchObject({ status: 503 });
      expect(bulkWrite).not.toHaveBeenCalled();
    });

    it('rethrows an unknown error unchanged', async () => {
      existing.mockResolvedValue(new Set([V1]));
      const boom = new Error('boom');
      insertMany.mockRejectedValue(boom);
      await expect(
        service.ingestBatch(user, { readings: [reading(V1)] }),
      ).rejects.toBe(boom);
    });

    it('rethrows a bulk error that carries no write errors', async () => {
      existing.mockResolvedValue(new Set([V1]));
      const error = bulkError([], 0);
      insertMany.mockRejectedValue(error);
      await expect(
        service.ingestBatch(user, { readings: [reading(V1)] }),
      ).rejects.toBe(error);
    });
  });

  describe('latest update', () => {
    const opsOf = (call: number) =>
      bulkWrite.mock.calls[call][0] as {
        replaceOne: {
          filter: { vehicleId: string; timestamp: { $lt: Date } };
          upsert: boolean;
        };
      }[];

    it('writes one op per vehicle using the newest stored reading', async () => {
      existing.mockResolvedValue(new Set([V1, V2]));
      const newest = minutesAgo(1);
      await service.ingestBatch(user, {
        readings: [
          reading(V1, minutesAgo(10)),
          reading(V2, minutesAgo(3)),
          reading(V1, newest),
          reading(V1, minutesAgo(5)),
        ],
      });

      const ops = opsOf(0);
      expect(ops).toHaveLength(2);
      const v1 = ops.find((o) => o.replaceOne.filter.vehicleId === V1)!;
      expect(v1.replaceOne.filter.timestamp.$lt).toEqual(new Date(newest));
    });

    it('retries only the duplicate-key vehicles, without upsert', async () => {
      existing.mockResolvedValue(new Set([V1, V2, V3]));
      // Ops are in insertion order of the newest map: V1, V2, V3. V2 fails with 11000.
      bulkWrite
        .mockRejectedValueOnce(bulkError([{ index: 1, code: 11000 }], 0))
        .mockResolvedValueOnce({});

      await service.ingestBatch(user, {
        readings: [reading(V1), reading(V2), reading(V3)],
      });

      expect(bulkWrite).toHaveBeenCalledTimes(2);
      const retry = opsOf(1);
      expect(retry).toHaveLength(1);
      expect(retry[0].replaceOne.filter.vehicleId).toBe(V2);
      expect(retry[0].replaceOne.upsert).toBe(false);
    });

    it('does not retry other write error codes and does not fail the request', async () => {
      existing.mockResolvedValue(new Set([V1]));
      bulkWrite.mockRejectedValueOnce(bulkError([{ index: 0, code: 121 }], 0));

      const out = await service.ingestOne(user, reading(V1));

      expect(out.vehicleId).toBe(V1);
      expect(bulkWrite).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalled();
    });

    it('logs and still succeeds when the latest step fails entirely', async () => {
      existing.mockResolvedValue(new Set([V1]));
      bulkWrite.mockRejectedValue(new Error('latest down'));

      const out = await service.ingestBatch(user, { readings: [reading(V1)] });

      expect(out).toEqual({ accepted: 1, rejected: [] });
      expect(bulkWrite).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalled();
    });

    it('logs and succeeds when the retry itself fails', async () => {
      existing.mockResolvedValue(new Set([V1]));
      bulkWrite
        .mockRejectedValueOnce(bulkError([{ index: 0, code: 11000 }], 0))
        .mockRejectedValueOnce(new Error('retry down'));

      await expect(service.ingestOne(user, reading(V1))).resolves.toBeDefined();
      expect(logError).toHaveBeenCalled();
    });
  });
});
