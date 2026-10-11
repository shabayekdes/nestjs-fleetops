import type {
  EngineMetrics,
  TelemetryMeasurements,
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from './mongo/telemetry-documents.js';
import type { CreateTelemetryReadingDto } from './dto/create-telemetry-reading.dto.js';
import type {
  EngineResponseDto,
  TelemetryReadingResponseDto,
  VehicleLatestStatusResponseDto,
} from './dto/telemetry-response.dto.js';

const toEngineDocument = (
  engine: NonNullable<CreateTelemetryReadingDto['engine']>,
): EngineMetrics => ({
  on: engine.on,
  ...(engine.rpm !== undefined ? { rpm: engine.rpm } : {}),
  ...(engine.coolantTempC !== undefined
    ? { coolantTempC: engine.coolantTempC }
    : {}),
});

/** Builds the stored reading. Optional fields that are absent are omitted. */
export function toReadingDocument(
  organizationId: string,
  dto: CreateTelemetryReadingDto,
  receivedAt: Date,
): TelemetryReadingDocument {
  return {
    timestamp: new Date(dto.timestamp),
    meta: {
      organizationId,
      vehicleId: dto.vehicleId.toLowerCase(),
    },
    // GeoJSON order is [longitude, latitude].
    location: {
      type: 'Point',
      coordinates: [dto.location.longitude, dto.location.latitude],
    },
    speedKph: dto.speedKph,
    ...(dto.fuelLevelPercent !== undefined
      ? { fuelLevelPercent: dto.fuelLevelPercent }
      : {}),
    ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
    ...(dto.engine ? { engine: toEngineDocument(dto.engine) } : {}),
    receivedAt,
  };
}

/** Exact copy of one reading as a latest-status document (without _id). */
export function toLatestDocument(
  reading: TelemetryReadingDocument,
  updatedAt: Date,
): Omit<VehicleLatestStatusDocument, '_id'> {
  return {
    organizationId: reading.meta.organizationId,
    vehicleId: reading.meta.vehicleId,
    timestamp: reading.timestamp,
    location: reading.location,
    speedKph: reading.speedKph,
    ...(reading.fuelLevelPercent !== undefined
      ? { fuelLevelPercent: reading.fuelLevelPercent }
      : {}),
    ...(reading.odometerKm !== undefined
      ? { odometerKm: reading.odometerKm }
      : {}),
    ...(reading.engine ? { engine: reading.engine } : {}),
    receivedAt: reading.receivedAt,
    updatedAt,
  };
}

const toEngineResponse = (
  engine: EngineMetrics | undefined,
): EngineResponseDto | null =>
  engine
    ? {
        on: engine.on,
        rpm: engine.rpm ?? null,
        coolantTempC: engine.coolantTempC ?? null,
      }
    : null;

function toMeasurementsResponse(
  doc: TelemetryMeasurements,
): Omit<TelemetryReadingResponseDto, 'vehicleId' | 'timestamp'> {
  const [longitude, latitude] = doc.location.coordinates;
  return {
    location: { latitude, longitude },
    speedKph: doc.speedKph,
    fuelLevelPercent: doc.fuelLevelPercent ?? null,
    odometerKm: doc.odometerKm ?? null,
    engine: toEngineResponse(doc.engine),
    receivedAt: doc.receivedAt,
  };
}

export function toReadingResponse(
  doc: TelemetryReadingDocument,
): TelemetryReadingResponseDto {
  return {
    vehicleId: doc.meta.vehicleId,
    timestamp: doc.timestamp,
    ...toMeasurementsResponse(doc),
  };
}

export function toLatestResponse(
  doc: Omit<VehicleLatestStatusDocument, '_id'>,
): VehicleLatestStatusResponseDto {
  return {
    vehicleId: doc.vehicleId,
    timestamp: doc.timestamp,
    ...toMeasurementsResponse(doc),
    updatedAt: doc.updatedAt,
  };
}
