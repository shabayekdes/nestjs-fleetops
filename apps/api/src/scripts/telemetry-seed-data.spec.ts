import { generateTelemetrySeed } from './telemetry-seed-data.js';

const ORG = '0192f0a0-0000-7000-8000-000000000001';
const vehicles = [
  { organizationId: ORG, vehicleId: '0192f0a0-0000-7000-8000-0000000000a1' },
  { organizationId: ORG, vehicleId: '0192f0a0-0000-7000-8000-0000000000a2' },
  { organizationId: ORG, vehicleId: '0192F0A0-0000-7000-8000-0000000000A3' },
];
const now = new Date('2026-03-04T12:34:56.789Z');
const days = 3;
const options = { now, days, seed: 42 };

describe('generateTelemetrySeed', () => {
  const readings = generateTelemetrySeed(vehicles, options);
  const byVehicle = (id: string) =>
    readings.filter((r) => r.meta.vehicleId === id.toLowerCase());

  it('is deterministic for the same seed and now', () => {
    expect(generateTelemetrySeed(vehicles, options)).toEqual(readings);
  });

  it('changes with the seed', () => {
    expect(
      generateTelemetrySeed(vehicles, { ...options, seed: 43 }),
    ).not.toEqual(readings);
  });

  it('generates a plausible volume for every vehicle', () => {
    for (const v of vehicles) {
      expect(byVehicle(v.vehicleId).length).toBeGreaterThan(1000);
    }
  });

  it('keeps timestamps within [now - days, now]', () => {
    const max = now.getTime();
    const min = max - days * 86_400_000;
    for (const r of readings) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(min);
      expect(r.timestamp.getTime()).toBeLessThanOrEqual(max);
    }
  });

  it('sorts readings per vehicle without duplicate timestamps', () => {
    for (const v of vehicles) {
      const times = byVehicle(v.vehicleId).map((r) => r.timestamp.getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThan(times[i - 1]);
      }
    }
  });

  it('keeps coordinates in range and around Cairo', () => {
    for (const r of readings) {
      const [lng, lat] = r.location.coordinates;
      expect(r.location.type).toBe('Point');
      expect(lng).toBeGreaterThan(31.1);
      expect(lng).toBeLessThan(31.45);
      expect(lat).toBeGreaterThan(29.9);
      expect(lat).toBeLessThan(30.15);
    }
  });

  it('never decreases the odometer per vehicle', () => {
    for (const v of vehicles) {
      const odo = byVehicle(v.vehicleId).map((r) => r.odometerKm as number);
      for (let i = 1; i < odo.length; i++) {
        expect(odo[i]).toBeGreaterThanOrEqual(odo[i - 1]);
      }
      expect(odo[odo.length - 1]).toBeGreaterThan(odo[0]);
    }
  });

  it('has speed 0 when the engine is off and moves when it is on', () => {
    for (const r of readings) {
      if (!r.engine?.on) expect(r.speedKph).toBe(0);
      expect(r.speedKph).toBeGreaterThanOrEqual(0);
      expect(r.speedKph).toBeLessThanOrEqual(140);
    }
    expect(readings.some((r) => r.engine?.on && r.speedKph > 20)).toBe(true);
  });

  it('keeps fuel between 0 and 100 and engine metrics plausible', () => {
    for (const r of readings) {
      expect(r.fuelLevelPercent).toBeGreaterThanOrEqual(0);
      expect(r.fuelLevelPercent).toBeLessThanOrEqual(100);
      if (r.engine?.on) {
        expect(r.engine.rpm).toBeGreaterThan(0);
        expect(r.engine.coolantTempC).toBeGreaterThan(60);
      } else {
        expect(r.engine).toEqual({ on: false });
      }
    }
  });

  it('uses the passed organization and lowercase vehicle ids', () => {
    const ids = new Set(vehicles.map((v) => v.vehicleId.toLowerCase()));
    for (const r of readings) {
      expect(r.meta.organizationId).toBe(ORG);
      expect(ids.has(r.meta.vehicleId)).toBe(true);
    }
    expect(new Set(readings.map((r) => r.meta.vehicleId)).size).toBe(3);
  });

  it('does not move vehicles identically', () => {
    const first = byVehicle(vehicles[0].vehicleId).map(
      (r) => r.location.coordinates,
    );
    const second = byVehicle(vehicles[1].vehicleId).map(
      (r) => r.location.coordinates,
    );
    expect(first).not.toEqual(second);
  });
});
