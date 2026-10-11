import type { ObjectId } from 'mongodb';

/** Time series metaField. IDs are lowercase UUID strings, not BSON UUIDs. */
export interface TelemetryMeta {
  organizationId: string;
  vehicleId: string;
}

/** One raw reading. L8 adds the measurements. */
export interface TelemetryReadingDocument {
  _id?: ObjectId;
  timestamp: Date;
  meta: TelemetryMeta;
}

/** Latest known state per vehicle. Created in L7, written from L8. */
export interface VehicleLatestStatusDocument {
  _id?: ObjectId;
  organizationId: string;
  vehicleId: string;
  timestamp: Date;
  location?: { type: 'Point'; coordinates: [number, number] };
  updatedAt: Date;
}
