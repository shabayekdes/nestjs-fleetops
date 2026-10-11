import type { ObjectId } from 'mongodb';

/** Time series metaField. IDs are lowercase UUID strings, not BSON UUIDs. */
export interface TelemetryMeta {
  organizationId: string;
  vehicleId: string;
}

/** GeoJSON point: coordinates are [longitude, latitude]. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface EngineMetrics {
  on: boolean;
  rpm?: number;
  coolantTempC?: number;
}

/** Measurements shared by a raw reading and the latest-status copy of it. */
export interface TelemetryMeasurements {
  location: GeoPoint;
  speedKph: number;
  fuelLevelPercent?: number;
  odometerKm?: number;
  engine?: EngineMetrics;
  /** Server time when the reading was accepted. */
  receivedAt: Date;
}

/** One raw reading. Absent optional measurements are not stored (no nulls). */
export interface TelemetryReadingDocument extends TelemetryMeasurements {
  _id?: ObjectId;
  timestamp: Date;
  meta: TelemetryMeta;
}

/** Latest known state per vehicle: an exact copy of its newest reading. */
export interface VehicleLatestStatusDocument extends TelemetryMeasurements {
  _id?: ObjectId;
  organizationId: string;
  vehicleId: string;
  timestamp: Date;
  updatedAt: Date;
}
