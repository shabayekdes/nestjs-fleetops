/**
 * Pure generator of SYNTHETIC telemetry for the development seed. No Prisma,
 * no MongoDB, no clock: everything depends on its arguments, so the same
 * (vehicles, now, days, seed) always gives the same readings.
 *
 * The picture: each vehicle starts its shift around 08:00 Africa/Cairo from a
 * depot, drives (one reading per minute) to a customer zone, waits there,
 * drives back, and repeats until about 18:00, with a lunch stop around noon.
 * Overnight it is parked at the depot (engine off, a reading every 15
 * minutes, tiny GPS jitter). No real vehicle or person is represented.
 */
import type { TelemetryReadingDocument } from '../telemetry/mongo/telemetry-documents.js';

export interface SeedVehicle {
  organizationId: string;
  vehicleId: string;
}

export interface SeedOptions {
  now: Date;
  days: number;
  seed: number;
}

type LngLat = [number, number];

const MINUTE = 60_000;
const DAY = 86_400_000;
const DRIVE_STEP = MINUTE;
const STOP_STEP = 5 * MINUTE;
const PARKED_STEP = 15 * MINUTE;
const TIME_ZONE = 'Africa/Cairo';

/** Synthetic places around Cairo, [longitude, latitude]. */
const DEPOTS: LngLat[] = [
  [31.2, 30.06],
  [31.21, 30.0],
];
const ZONES: LngLat[] = [
  [31.245, 30.045], // downtown
  [31.32, 30.09], // heliopolis
  [31.34, 30.06], // nasr city
  [31.21, 29.987], // giza
  [31.25, 29.96], // maadi
];

/** Small seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: () => number, min: number, max: number) =>
  min + rng() * (max - min);
const intBetween = (rng: () => number, min: number, max: number) =>
  Math.floor(between(rng, min, max + 1));
const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

function haversineKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Curved route: a quadratic Bezier bent sideways by a fraction of the span. */
interface Route {
  from: LngLat;
  to: LngLat;
  control: LngLat;
  lengthKm: number;
}

function pointOnRoute(route: Route, p: number): LngLat {
  const q = 1 - p;
  return [
    q * q * route.from[0] + 2 * q * p * route.control[0] + p * p * route.to[0],
    q * q * route.from[1] + 2 * q * p * route.control[1] + p * p * route.to[1],
  ];
}

function makeRoute(from: LngLat, to: LngLat, bend: number): Route {
  const mid: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const control: LngLat = [mid[0] - dy * bend, mid[1] + dx * bend];
  const route: Route = { from, to, control, lengthKm: 0 };
  let length = 0;
  let prev = from;
  for (let i = 1; i <= 32; i++) {
    const next = pointOnRoute(route, i / 32);
    length += haversineKm(prev, next);
    prev = next;
  }
  route.lengthKm = length;
  return route;
}

const smoothstep = (p: number) => p * p * (3 - 2 * p);

interface Segment {
  kind: 'drive' | 'stop' | 'parked';
  start: number;
  end: number;
  step: number;
  /** drive: the route. stop/parked: unused. */
  route?: Route;
  at: LngLat;
  odometerKm: number;
  fuelStart: number;
  fuelEnd: number;
  /** stop: instant of the refuel, when the fuel level jumps to fuelEnd. */
  refuelAt?: number;
}

/** Offset of Africa/Cairo from UTC at the given instant (DST-aware). */
function cairoOffsetMs(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of the Cairo midnight that starts the local day containing ms. */
function cairoMidnight(ms: number): number {
  const localMidnight = Math.floor((ms + cairoOffsetMs(ms)) / DAY) * DAY;
  return localMidnight - cairoOffsetMs(localMidnight - cairoOffsetMs(ms));
}

function buildTimeline(
  rng: () => number,
  index: number,
  rangeStart: number,
  rangeEnd: number,
): Segment[] {
  const depot = DEPOTS[index % DEPOTS.length];
  const zones = [...ZONES].sort(() => rng() - 0.5).slice(0, 3);
  const heavy = index % 3 === 2;
  // Percent of tank per km: vans about 0.12-0.16, trucks about 0.2-0.25.
  const fuelPerKm = heavy ? between(rng, 0.2, 0.25) : between(rng, 0.12, 0.16);
  const cruiseKph = heavy ? between(rng, 28, 34) : between(rng, 32, 40);
  const driveMinutes = (r: Route) =>
    Math.max(8, Math.round((r.lengthKm / cruiseKph) * 60));
  const shiftOffsetMin = (index % 4) * 10;

  const segments: Segment[] = [];
  let odometer = 20_000 + index * 13_000 + Math.floor(rng() * 5_000);
  let fuel = between(rng, 60, 95);
  let cursor = cairoMidnight(rangeStart - DAY);
  let place = depot;

  const push = (segment: Segment) => {
    segments.push(segment);
    cursor = segment.end;
  };
  const parkUntil = (until: number) => {
    if (until <= cursor) return;
    push({
      kind: 'parked',
      start: cursor,
      end: until,
      step: PARKED_STEP,
      at: place,
      odometerKm: odometer,
      fuelStart: fuel,
      fuelEnd: fuel,
    });
  };
  const stop = (minutes: number, at: LngLat) => {
    const start = cursor;
    const end = start + minutes * MINUTE;
    const refuel = fuel < 30;
    const fuelEnd = refuel ? between(rng, 85, 100) : fuel;
    push({
      kind: 'stop',
      start,
      end,
      step: STOP_STEP,
      at,
      odometerKm: odometer,
      fuelStart: fuel,
      fuelEnd,
      ...(refuel ? { refuelAt: start + Math.floor(minutes / 2) * MINUTE } : {}),
    });
    fuel = fuelEnd;
    place = at;
  };
  const drive = (route: Route) => {
    const minutes = driveMinutes(route);
    const start = cursor;
    const fuelEnd = Math.max(0, fuel - route.lengthKm * fuelPerKm);
    push({
      kind: 'drive',
      start,
      end: start + minutes * MINUTE,
      step: DRIVE_STEP,
      route,
      at: route.from,
      odometerKm: odometer,
      fuelStart: fuel,
      fuelEnd,
    });
    odometer += route.lengthKm;
    fuel = fuelEnd;
    place = route.to;
  };

  let dayStart = cursor;
  while (dayStart <= rangeEnd) {
    const shiftStart =
      dayStart + (8 * 60 + shiftOffsetMin + intBetween(rng, 0, 10)) * MINUTE;
    const shiftEnd = dayStart + 18 * 60 * MINUTE;
    parkUntil(shiftStart);
    let lunchTaken = false;

    for (;;) {
      const zone = zones[intBetween(rng, 0, zones.length - 1)];
      const target: LngLat = [
        zone[0] + between(rng, -0.003, 0.003),
        zone[1] + between(rng, -0.003, 0.003),
      ];
      const bend = between(rng, 0.08, 0.2) * (rng() < 0.5 ? -1 : 1);
      const there = makeRoute(depot, target, bend);
      const back = makeRoute(target, depot, -bend * between(rng, 0.5, 1.5));
      const needed =
        (driveMinutes(there) + driveMinutes(back) + 40 + 10) * MINUTE;
      if (cursor + needed > shiftEnd) break;

      drive(there);
      const localMinutes = (cursor + cairoOffsetMs(cursor) - dayStart) / MINUTE;
      // dayStart is Cairo midnight in UTC, so shift by the offset difference.
      const sinceMidnight = localMinutes - cairoOffsetMs(dayStart) / MINUTE;
      if (!lunchTaken && sinceMidnight >= 12 * 60 + 30) {
        lunchTaken = true;
        stop(45, target);
      } else {
        stop(intBetween(rng, 20, 40), target);
      }
      drive(back);
      stop(intBetween(rng, 10, 20), depot);
    }
    // Next Cairo day (DST-safe: jump 36 hours ahead, then snap to midnight).
    dayStart = cairoMidnight(dayStart + 36 * 60 * MINUTE);
  }
  parkUntil(Math.max(cursor, rangeEnd + DAY));
  return segments;
}

function readingAt(
  segment: Segment,
  t: number,
  rng: () => number,
  vehicle: SeedVehicle,
): TelemetryReadingDocument {
  const timestamp = new Date(t);
  let location: LngLat;
  let speedKph = 0;
  let odometerKm = segment.odometerKm;
  let fuel = segment.fuelStart;
  let engineOn = false;

  if (segment.kind === 'drive' && segment.route) {
    const span = segment.end - segment.start;
    const progress = (at: number) =>
      smoothstep(Math.min(1, Math.max(0, (at - segment.start) / span)));
    const p = progress(t);
    location = pointOnRoute(segment.route, p);
    const before = pointOnRoute(segment.route, progress(t - DRIVE_STEP));
    // Distance moved during the last minute, as km per hour.
    speedKph = haversineKm(before, location) * 60;
    odometerKm += segment.route.lengthKm * p;
    fuel = segment.fuelStart + (segment.fuelEnd - segment.fuelStart) * p;
    engineOn = true;
  } else {
    // Parked or stopped: a few metres of GPS jitter around the place.
    location = [
      segment.at[0] + between(rng, -0.00003, 0.00003),
      segment.at[1] + between(rng, -0.00003, 0.00003),
    ];
    if (segment.refuelAt !== undefined && t >= segment.refuelAt) {
      fuel = segment.fuelEnd;
    }
  }

  const speed = round(Math.min(speedKph, 140), 1);
  const reading: TelemetryReadingDocument = {
    timestamp,
    meta: {
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.vehicleId.toLowerCase(),
    },
    location: {
      type: 'Point',
      coordinates: [round(location[0], 6), round(location[1], 6)],
    },
    speedKph: speed,
    fuelLevelPercent: round(Math.min(100, Math.max(0, fuel)), 1),
    odometerKm: round(odometerKm, 1),
    engine: engineOn
      ? {
          on: true,
          rpm: Math.round(
            Math.min(6000, 850 + speed * 25 + between(rng, 0, 150)),
          ),
          coolantTempC: round(between(rng, 86, 96), 1),
        }
      : { on: false },
    receivedAt: timestamp,
  };
  return reading;
}

/**
 * Generates readings for every vehicle over the `days` before `now`
 * (inclusive of the current minute). Output is grouped per vehicle, in the
 * input order, ascending by timestamp.
 */
export function generateTelemetrySeed(
  vehicles: SeedVehicle[],
  { now, days, seed }: SeedOptions,
): TelemetryReadingDocument[] {
  const rangeEnd = now.getTime();
  const rangeStart = rangeEnd - days * DAY;
  const out: TelemetryReadingDocument[] = [];

  vehicles.forEach((vehicle, index) => {
    const rng = createRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    const timeline = buildTimeline(rng, index, rangeStart, rangeEnd);
    for (const segment of timeline) {
      const from = Math.max(segment.start, rangeStart);
      const to = Math.min(segment.end - 1, rangeEnd);
      // Readings sit on a grid, so re-runs produce the same timestamps.
      for (
        let t = Math.ceil(from / segment.step) * segment.step;
        t <= to;
        t += segment.step
      ) {
        out.push(readingAt(segment, t, rng, vehicle));
      }
    }
  });
  return out;
}
