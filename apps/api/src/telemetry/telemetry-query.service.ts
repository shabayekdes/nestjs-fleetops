import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Collection, Document } from 'mongodb';
import type { AuthUser } from '../auth/auth.types.js';
import type { DailyQueryDto } from './dto/daily-query.dto.js';
import type { LatestListQueryDto } from './dto/latest-list-query.dto.js';
import type { ListReadingsQueryDto } from './dto/list-readings-query.dto.js';
import type { NearQueryDto } from './dto/near-query.dto.js';
import type {
  DailySummaryDto,
  DailySummaryListResponseDto,
  LatestStatusListResponseDto,
  NearbyVehiclesResponseDto,
  TelemetryReadingListResponseDto,
  VehicleLatestStatusResponseDto,
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
import { MS_PER_DAY } from './telemetry.constants.js';
import { toLatestResponse, toReadingResponse } from './telemetry.mappers.js';
import {
  VEHICLE_DIRECTORY,
  type VehicleDirectory,
} from './vehicle-directory.port.js';

type Latest = Omit<VehicleLatestStatusDocument, '_id'>;

/** Runs a Mongo call, mapping known driver failures (503) and rethrowing others. */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw mapMongoError(error) ?? error;
  }
}

@Injectable()
export class TelemetryQueryService {
  constructor(
    @Inject(TELEMETRY_READINGS_COLLECTION)
    private readonly readings: Collection<TelemetryReadingDocument>,
    @Inject(VEHICLE_LATEST_STATUS_COLLECTION)
    private readonly latest: Collection<VehicleLatestStatusDocument>,
    @Inject(VEHICLE_DIRECTORY)
    private readonly vehicles: VehicleDirectory,
  ) {}

  private async assertVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const known = await this.vehicles.existingVehicleIds(organizationId, [
      vehicleId,
    ]);
    if (!known.has(vehicleId)) throw new NotFoundException('Vehicle not found');
  }

  async findReadings(
    user: AuthUser,
    rawVehicleId: string,
    query: ListReadingsQueryDto,
  ): Promise<TelemetryReadingListResponseDto> {
    const vehicleId = rawVehicleId.toLowerCase();
    await this.assertVehicle(user.organizationId, vehicleId);

    const to = new Date(query.to);
    const before = query.before ? new Date(query.before) : undefined;
    // The cursor is exclusive, `to` is inclusive; the stricter bound wins.
    const upper = before && before <= to ? { $lt: before } : { $lte: to };

    const docs = await guarded(() =>
      this.readings
        .find(
          {
            'meta.organizationId': user.organizationId,
            'meta.vehicleId': vehicleId,
            timestamp: { $gte: new Date(query.from), ...upper },
          },
          { projection: { _id: 0 } },
        )
        .sort({ timestamp: -1 })
        .limit(query.limit)
        .toArray(),
    );
    const last = docs[docs.length - 1];
    return {
      data: docs.map(toReadingResponse),
      meta: {
        limit: query.limit,
        nextCursor:
          docs.length === query.limit && last
            ? last.timestamp.toISOString()
            : null,
      },
    };
  }

  async findLatest(
    user: AuthUser,
    rawVehicleId: string,
  ): Promise<VehicleLatestStatusResponseDto> {
    const vehicleId = rawVehicleId.toLowerCase();
    await this.assertVehicle(user.organizationId, vehicleId);
    const doc = await guarded(() =>
      this.latest.findOne(
        { organizationId: user.organizationId, vehicleId },
        { projection: { _id: 0 } },
      ),
    );
    if (!doc) throw new NotFoundException('No telemetry for this vehicle yet');
    return toLatestResponse(doc);
  }

  async listLatest(
    user: AuthUser,
    query: LatestListQueryDto,
  ): Promise<LatestStatusListResponseDto> {
    const docs = await guarded(() =>
      this.latest
        .find(
          {
            organizationId: user.organizationId,
            ...(query.after ? { vehicleId: { $gt: query.after } } : {}),
          },
          { projection: { _id: 0 } },
        )
        .sort({ vehicleId: 1 })
        .limit(query.limit)
        .toArray(),
    );
    const last = docs[docs.length - 1];
    return {
      data: docs.map(toLatestResponse),
      meta: {
        limit: query.limit,
        nextCursor: docs.length === query.limit && last ? last.vehicleId : null,
      },
    };
  }

  async findNear(
    user: AuthUser,
    query: NearQueryDto,
  ): Promise<NearbyVehiclesResponseDto> {
    // $geoNear must be the first stage; organizationId in its query is what
    // lets it use the (organizationId, 2dsphere) compound index.
    const docs = await guarded(() =>
      this.latest
        .aggregate<Latest & { distanceMeters: number }>([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [query.longitude, query.latitude],
              },
              key: 'location',
              distanceField: 'distanceMeters',
              maxDistance: query.radiusMeters,
              query: { organizationId: user.organizationId },
              spherical: true,
            },
          },
          { $limit: query.limit },
          { $project: { _id: 0 } },
        ])
        .toArray(),
    );
    return {
      data: docs.map((doc) => ({
        ...toLatestResponse(doc),
        distanceMeters: Math.round(doc.distanceMeters * 10) / 10,
      })),
    };
  }

  async findDaily(
    user: AuthUser,
    rawVehicleId: string,
    query: DailyQueryDto,
  ): Promise<DailySummaryListResponseDto> {
    const vehicleId = rawVehicleId.toLowerCase();
    await this.assertVehicle(user.organizationId, vehicleId);

    const fromUtc = new Date(`${query.from}T00:00:00.000Z`).getTime();
    const toUtc = new Date(`${query.to}T00:00:00.000Z`).getTime();
    // Widened by whole days so no time zone arithmetic is needed here: the
    // exact local-day filter happens after grouping.
    const pipeline: Document[] = [
      {
        $match: {
          'meta.organizationId': user.organizationId,
          'meta.vehicleId': vehicleId,
          timestamp: {
            $gte: new Date(fromUtc - MS_PER_DAY),
            $lt: new Date(toUtc + 2 * MS_PER_DAY),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
              timezone: query.timezone,
            },
          },
          readings: { $sum: 1 },
          avgSpeedKph: { $avg: '$speedKph' },
          maxSpeedKph: { $max: '$speedKph' },
          avgFuelLevelPercent: { $avg: '$fuelLevelPercent' },
          minOdometerKm: { $min: '$odometerKm' },
          maxOdometerKm: { $max: '$odometerKm' },
        },
      },
      { $match: { _id: { $gte: query.from, $lte: query.to } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          readings: 1,
          avgSpeedKph: { $round: ['$avgSpeedKph', 1] },
          maxSpeedKph: { $round: ['$maxSpeedKph', 1] },
          avgFuelLevelPercent: { $round: ['$avgFuelLevelPercent', 1] },
          distanceKm: {
            $round: [{ $subtract: ['$maxOdometerKm', '$minOdometerKm'] }, 1],
          },
        },
      },
    ];
    const data = await guarded(() =>
      this.readings.aggregate<DailySummaryDto>(pipeline).toArray(),
    );
    return {
      vehicleId,
      timezone: query.timezone,
      from: query.from,
      to: query.to,
      data,
    };
  }
}
