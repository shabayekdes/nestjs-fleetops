import type { CreateTelemetryReadingDto } from './dto/create-telemetry-reading.dto.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from './mongo/telemetry-documents.js';
import {
  toLatestDocument,
  toLatestResponse,
  toReadingDocument,
  toReadingResponse,
} from './telemetry.mappers.js';

const ORG = '01890a5d-ac96-774b-bcce-b302099a8000';
const VEHICLE = '01890a5d-ac96-774b-bcce-b302099a8057';
const RECEIVED = new Date('2026-10-01T10:00:05.000Z');

const dto = (
  over: Partial<CreateTelemetryReadingDto> = {},
): CreateTelemetryReadingDto => ({
  vehicleId: VEHICLE,
  timestamp: '2026-10-01T10:00:00.000Z',
  location: { latitude: 30, longitude: 31 },
  speedKph: 40,
  ...over,
});

describe('toReadingDocument', () => {
  it('stores GeoJSON as [longitude, latitude]', () => {
    const doc = toReadingDocument(ORG, dto(), RECEIVED);
    expect(doc.location).toEqual({ type: 'Point', coordinates: [31, 30] });
  });

  it('takes organizationId from the argument and lowercases the vehicleId', () => {
    const doc = toReadingDocument(
      ORG,
      dto({ vehicleId: VEHICLE.toUpperCase() }),
      RECEIVED,
    );
    expect(doc.meta).toEqual({ organizationId: ORG, vehicleId: VEHICLE });
  });

  it('converts the timestamp to a Date and sets receivedAt', () => {
    const doc = toReadingDocument(ORG, dto(), RECEIVED);
    expect(doc.timestamp).toEqual(new Date('2026-10-01T10:00:00.000Z'));
    expect(doc.receivedAt).toBe(RECEIVED);
  });

  it('omits absent optionals instead of storing null', () => {
    const doc = toReadingDocument(ORG, dto(), RECEIVED);
    expect(Object.keys(doc).sort()).toEqual(
      ['location', 'meta', 'receivedAt', 'speedKph', 'timestamp'].sort(),
    );
  });

  it('keeps present optionals, including zero values', () => {
    const doc = toReadingDocument(
      ORG,
      dto({
        fuelLevelPercent: 0,
        odometerKm: 0,
        engine: { on: false, rpm: 0 },
      }),
      RECEIVED,
    );
    expect(doc.fuelLevelPercent).toBe(0);
    expect(doc.odometerKm).toBe(0);
    expect(doc.engine).toEqual({ on: false, rpm: 0 });
    expect(doc.engine).not.toHaveProperty('coolantTempC');
  });
});

describe('toLatestDocument', () => {
  it('is an exact copy of the reading plus updatedAt, with flat ids', () => {
    const reading = toReadingDocument(
      ORG,
      dto({ fuelLevelPercent: 50, engine: { on: true } }),
      RECEIVED,
    );
    const updatedAt = new Date('2026-10-01T10:00:06.000Z');
    expect(toLatestDocument(reading, updatedAt)).toEqual({
      organizationId: ORG,
      vehicleId: VEHICLE,
      timestamp: reading.timestamp,
      location: reading.location,
      speedKph: 40,
      fuelLevelPercent: 50,
      engine: { on: true },
      receivedAt: RECEIVED,
      updatedAt,
    });
  });

  it('does not carry optionals the reading lacks', () => {
    const reading = toReadingDocument(ORG, dto(), RECEIVED);
    const latest = toLatestDocument(reading, RECEIVED);
    expect(latest).not.toHaveProperty('fuelLevelPercent');
    expect(latest).not.toHaveProperty('odometerKm');
    expect(latest).not.toHaveProperty('engine');
  });
});

describe('toReadingResponse', () => {
  it('maps [lng, lat] back to latitude/longitude and hides organizationId', () => {
    const doc = toReadingDocument(ORG, dto(), RECEIVED);
    const out = toReadingResponse(doc);
    expect(out.location).toEqual({ latitude: 30, longitude: 31 });
    expect(out.vehicleId).toBe(VEHICLE);
    expect(JSON.stringify(out)).not.toContain(ORG);
    expect(out).not.toHaveProperty('_id');
    expect(out).not.toHaveProperty('meta');
  });

  it('returns null for absent optionals', () => {
    const out = toReadingResponse(toReadingDocument(ORG, dto(), RECEIVED));
    expect(out).toMatchObject({
      fuelLevelPercent: null,
      odometerKm: null,
      engine: null,
    });
  });

  it('returns null for absent engine sub-fields and keeps zeros', () => {
    const doc: TelemetryReadingDocument = toReadingDocument(
      ORG,
      dto({ odometerKm: 0, engine: { on: true } }),
      RECEIVED,
    );
    const out = toReadingResponse(doc);
    expect(out.engine).toEqual({ on: true, rpm: null, coolantTempC: null });
    expect(out.odometerKm).toBe(0);
  });
});

describe('toLatestResponse', () => {
  it('includes updatedAt and omits organizationId and _id', () => {
    const latest: VehicleLatestStatusDocument = {
      ...toLatestDocument(toReadingDocument(ORG, dto(), RECEIVED), RECEIVED),
    };
    const out = toLatestResponse(latest);
    expect(out.updatedAt).toBe(RECEIVED);
    expect(out).not.toHaveProperty('organizationId');
    expect(out).not.toHaveProperty('_id');
    expect(out.location).toEqual({ latitude: 30, longitude: 31 });
  });
});
