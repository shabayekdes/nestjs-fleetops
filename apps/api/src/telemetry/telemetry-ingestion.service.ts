import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AnyBulkWriteOperation,
  type Collection,
  MongoBulkWriteError,
} from 'mongodb';
import type { AuthUser } from '../auth/auth.types.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { BatchTelemetryReadingsDto } from './dto/batch-telemetry-readings.dto.js';
import type { CreateTelemetryReadingDto } from './dto/create-telemetry-reading.dto.js';
import type {
  BatchIngestResponseDto,
  RejectedReadingDto,
  TelemetryReadingResponseDto,
} from './dto/telemetry-response.dto.js';
import {
  TELEMETRY_READINGS_COLLECTION,
  VEHICLE_LATEST_STATUS_COLLECTION,
} from './mongo/mongo.tokens.js';
import { mapMongoError } from './mongo/mongo-errors.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from './mongo/telemetry-documents.js';
import {
  toLatestDocument,
  toReadingDocument,
  toReadingResponse,
} from './telemetry.mappers.js';
import { MS_PER_DAY } from './telemetry.constants.js';
import {
  VEHICLE_DIRECTORY,
  type VehicleDirectory,
} from './vehicle-directory.port.js';

const DUPLICATE_KEY = 11000;

type LatestOp = AnyBulkWriteOperation<VehicleLatestStatusDocument>;

interface BulkWriteFailure {
  index: number;
  code: number;
  errmsg?: string;
}

/** Normalises the driver's one-or-many writeErrors into a typed array. */
function writeFailures(error: MongoBulkWriteError): BulkWriteFailure[] {
  const raw: unknown = error.writeErrors;
  if (raw === undefined || raw === null) return [];
  return (Array.isArray(raw) ? raw : [raw]) as BulkWriteFailure[];
}

/** Converts a driver failure to an HTTP error when known, else rethrows it. */
function rethrowMapped(error: unknown): never {
  throw mapMongoError(error) ?? error;
}

@Injectable()
export class TelemetryIngestionService {
  private readonly logger = new Logger(TelemetryIngestionService.name);

  constructor(
    @Inject(TELEMETRY_READINGS_COLLECTION)
    private readonly readings: Collection<TelemetryReadingDocument>,
    @Inject(VEHICLE_LATEST_STATUS_COLLECTION)
    private readonly latest: Collection<VehicleLatestStatusDocument>,
    @Inject(VEHICLE_DIRECTORY)
    private readonly vehicles: VehicleDirectory,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async ingestOne(
    user: AuthUser,
    dto: CreateTelemetryReadingDto,
  ): Promise<TelemetryReadingResponseDto> {
    const vehicleId = dto.vehicleId.toLowerCase();
    const known = await this.vehicles.existingVehicleIds(user.organizationId, [
      vehicleId,
    ]);
    if (!known.has(vehicleId)) {
      throw new NotFoundException('Vehicle not found');
    }
    if (this.isTooOld(new Date(dto.timestamp))) {
      throw new UnprocessableEntityException(
        'Reading is older than the retention period',
      );
    }

    const doc = toReadingDocument(user.organizationId, dto, new Date());
    try {
      await this.readings.insertOne(doc);
    } catch (error) {
      rethrowMapped(error);
    }
    await this.updateLatest([doc]);
    return toReadingResponse(doc);
  }

  async ingestBatch(
    user: AuthUser,
    dto: BatchTelemetryReadingsDto,
  ): Promise<BatchIngestResponseDto> {
    const rejected: RejectedReadingDto[] = [];
    const ids = dto.readings.map((r) => r.vehicleId.toLowerCase());
    const known = await this.vehicles.existingVehicleIds(
      user.organizationId,
      ids,
    );

    const receivedAt = new Date();
    // Pairs of request index and the document to store.
    const candidates: { index: number; doc: TelemetryReadingDocument }[] = [];
    dto.readings.forEach((reading, index) => {
      const vehicleId = ids[index];
      if (!known.has(vehicleId)) {
        rejected.push({ index, vehicleId, reason: 'VEHICLE_NOT_FOUND' });
      } else if (this.isTooOld(new Date(reading.timestamp))) {
        rejected.push({ index, vehicleId, reason: 'TOO_OLD' });
      } else {
        candidates.push({
          index,
          doc: toReadingDocument(user.organizationId, reading, receivedAt),
        });
      }
    });

    if (candidates.length === 0) {
      return { accepted: 0, rejected };
    }

    let stored = candidates;
    let accepted = candidates.length;
    try {
      await this.readings.insertMany(
        candidates.map((c) => c.doc),
        { ordered: false },
      );
    } catch (error) {
      if (!(error instanceof MongoBulkWriteError)) rethrowMapped(error);
      const writeErrors = writeFailures(error);
      if (writeErrors.length === 0) throw error;
      const failed = new Set(writeErrors.map((e) => e.index));
      for (const position of failed) {
        const candidate = candidates[position];
        if (!candidate) continue;
        rejected.push({
          index: candidate.index,
          vehicleId: candidate.doc.meta.vehicleId,
          reason: 'STORAGE_REJECTED',
        });
      }
      stored = candidates.filter((_, position) => !failed.has(position));
      accepted = error.insertedCount;
      this.logger.warn(
        `Batch insert rejected ${failed.size} of ${candidates.length} readings`,
      );
    }

    await this.updateLatest(stored.map((c) => c.doc));
    rejected.sort((a, b) => a.index - b.index);
    return { accepted, rejected };
  }

  private isTooOld(timestamp: Date): boolean {
    const days = this.config.get('TELEMETRY_RAW_RETENTION_DAYS', {
      infer: true,
    });
    return timestamp.getTime() < Date.now() - days * MS_PER_DAY;
  }

  /**
   * Keeps vehicle_latest_status equal to the newest stored reading per vehicle.
   * The filter guard (timestamp < new) makes it order-independent: an older or
   * replayed reading matches nothing and hits the unique index (11000), which
   * is the "stale" signal. The derived cache must never fail the request.
   */
  private async updateLatest(
    stored: readonly TelemetryReadingDocument[],
  ): Promise<void> {
    const newest = new Map<string, TelemetryReadingDocument>();
    for (const doc of stored) {
      const current = newest.get(doc.meta.vehicleId);
      if (!current || doc.timestamp > current.timestamp) {
        newest.set(doc.meta.vehicleId, doc);
      }
    }
    if (newest.size === 0) return;

    const updatedAt = new Date();
    const build =
      (upsert: boolean) =>
      (doc: TelemetryReadingDocument): LatestOp => ({
        replaceOne: {
          filter: {
            organizationId: doc.meta.organizationId,
            vehicleId: doc.meta.vehicleId,
            timestamp: { $lt: doc.timestamp },
          },
          replacement: toLatestDocument(doc, updatedAt),
          upsert,
        },
      });

    const docs = [...newest.values()];
    let duplicateKeyAt: number[];
    try {
      await this.latest.bulkWrite(docs.map(build(true)), { ordered: false });
      return;
    } catch (error) {
      duplicateKeyAt = this.duplicateKeyIndexes(error);
    }
    if (duplicateKeyAt.length === 0) return;

    // 11000 means stale OR a lost first-upsert race against a concurrent
    // writer. Retry without upsert: matchedCount 0 means genuinely stale.
    const retry = duplicateKeyAt.map((i) => docs[i]).filter(Boolean);
    try {
      await this.latest.bulkWrite(retry.map(build(false)), { ordered: false });
    } catch (error) {
      this.logger.error(
        `Latest-status retry failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Logs non-duplicate failures and returns the op indexes that hit 11000. */
  private duplicateKeyIndexes(error: unknown): number[] {
    if (!(error instanceof MongoBulkWriteError)) {
      this.logger.error(
        `Latest-status update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
    const writeErrors = writeFailures(error);
    const duplicates: number[] = [];
    for (const writeError of writeErrors) {
      if (writeError.code === DUPLICATE_KEY) {
        duplicates.push(writeError.index);
      } else {
        this.logger.error(
          `Latest-status write failed (code ${writeError.code}): ${writeError.errmsg}`,
        );
      }
    }
    if (writeErrors.length === 0) {
      this.logger.error(`Latest-status update failed: ${error.message}`);
    }
    return duplicates;
  }
}
