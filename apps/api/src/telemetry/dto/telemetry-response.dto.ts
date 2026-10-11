export class LocationResponseDto {
  latitude: number;
  longitude: number;
}

export class EngineResponseDto {
  on: boolean;
  rpm: number | null;
  coolantTempC: number | null;
}

/** One stored reading. Absent optional measurements are null. */
export class TelemetryReadingResponseDto {
  vehicleId: string;
  timestamp: Date;
  location: LocationResponseDto;
  speedKph: number;
  fuelLevelPercent: number | null;
  odometerKm: number | null;
  engine: EngineResponseDto | null;
  /** Server time when the reading was accepted. */
  receivedAt: Date;
}

export class CursorMetaDto {
  limit: number;
  /** Pass back as the cursor parameter for the next page, null at the end. */
  nextCursor: string | null;
}

export class TelemetryReadingListResponseDto {
  data: TelemetryReadingResponseDto[];
  meta: CursorMetaDto;
}

export class VehicleLatestStatusResponseDto extends TelemetryReadingResponseDto {
  /** When this latest-status document was last written. */
  updatedAt: Date;
}

export class LatestStatusListResponseDto {
  data: VehicleLatestStatusResponseDto[];
  meta: CursorMetaDto;
}

export class NearbyVehicleResponseDto extends VehicleLatestStatusResponseDto {
  distanceMeters: number;
}

export class NearbyVehiclesResponseDto {
  data: NearbyVehicleResponseDto[];
}

export class RejectedReadingDto {
  /** Position of the reading in the request. */
  index: number;
  vehicleId: string;
  reason: 'VEHICLE_NOT_FOUND' | 'TOO_OLD' | 'STORAGE_REJECTED';
}

export class BatchIngestResponseDto {
  accepted: number;
  rejected: RejectedReadingDto[];
}

export class DailySummaryDto {
  /** Local day (YYYY-MM-DD) in the requested time zone. */
  date: string;
  readings: number;
  avgSpeedKph: number | null;
  maxSpeedKph: number | null;
  avgFuelLevelPercent: number | null;
  /** max(odometerKm) - min(odometerKm) of the day; odometer resets are not handled. */
  distanceKm: number | null;
}

export class DailySummaryListResponseDto {
  vehicleId: string;
  timezone: string;
  from: string;
  to: string;
  data: DailySummaryDto[];
}
