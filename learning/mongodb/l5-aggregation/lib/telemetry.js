// Shared helpers for Learning Stage 5. Loaded by every exercise and solution
// with load('/learning/l5-aggregation/lib/telemetry.js').
//
// Synthetic telemetry that behaves like driving days, so summaries mean
// something:
// - vehicles work 07:00–19:00 Cairo time (UTC+3 in October 2026) and are
//   parked with the engine off at night;
// - each working hour: driving, then a stop with the engine running (idling),
//   then driving again;
// - the odometer adds up the distance driven; fuel drops with distance and
//   idling, and the tank is refilled when it runs low.
// Values are deterministic so output is stable between runs. Every document
// carries organizationId, and every pipeline starts by matching it.

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

const START = ISODate('2026-10-04T21:00:00Z'); // 5 Oct 00:00 in Cairo
const DAYS = 3;
const CAIRO_OFFSET_HOURS = 3;
const FLEET = [
  { _id: 'v-101', organizationId: 'org-north', plate: 'ABC-101', type: 'van' },
  { _id: 'v-102', organizationId: 'org-north', plate: 'ABC-102', type: 'van' },
  { _id: 'v-103', organizationId: 'org-north', plate: 'ABC-103', type: 'truck' },
  { _id: 'v-104', organizationId: 'org-north', plate: 'ABC-104', type: 'truck' },
  { _id: 'v-201', organizationId: 'org-south', plate: 'XYZ-201', type: 'van' },
  { _id: 'v-202', organizationId: 'org-south', plate: 'XYZ-202', type: 'truck' },
]; // prettier-ignore
const CODES = ['P0300', 'P0420', 'P0171', 'P0128'];

// All readings of one vehicle, one per minute, in time order.
function vehicleReadings(vehicle) {
  const n = Number(vehicle._id.slice(2));
  const idleMinutes = n % 3 === 0 ? 15 : 8; // some vehicles idle much longer
  let odometer = 10_000 + n * 100;
  let fuel = 90;
  const out = [];
  for (let m = 0; m < DAYS * 24 * 60; m++) {
    const timestamp = new Date(START.getTime() + m * 60_000);
    const localHour = (timestamp.getUTCHours() + CAIRO_OFFSET_HOURS) % 24;
    const minute = (m + n) % 60;
    const working = localHour >= 7 && localHour < 19;
    const idling = working && minute >= 40 && minute < 40 + idleMinutes;
    const engineOn = working;
    const speed = working && !idling ? 30 + ((m * 13 + n * 7) % 71) : 0; // 30–100 km/h
    odometer += speed / 60;
    fuel -= (speed / 60) * 0.12 + (idling ? 0.04 : 0);
    if (fuel < 20) fuel = 95; // refuelled
    const doc = {
      organizationId: vehicle.organizationId,
      vehicleId: vehicle._id,
      timestamp,
      speed,
      engineOn,
      odometer: Math.round(odometer * 10) / 10,
      fuelLevel: Math.round(fuel * 10) / 10,
    };
    if (working && (m + n) % 97 === 0) {
      doc.diagnostics = [
        { code: CODES[(m + n) % 4], severity: m % 2 ? 'high' : 'low' },
      ];
      if (m % 3 === 0) {
        doc.diagnostics.push({ code: CODES[(m + n + 1) % 4], severity: 'low' });
      }
    }
    out.push(doc);
  }
  return out;
}

// Drops and reloads `vehicles` and `readings` (6 vehicles × 3 days × 1 440 =
// 25 920 readings) with the ESR index from L3.
function seed() {
  db.vehicles.drop();
  db.vehicles.insertMany(FLEET);
  db.readings.drop();
  for (const v of FLEET) db.readings.insertMany(vehicleReadings(v));
  db.readings.createIndex({ organizationId: 1, vehicleId: 1, timestamp: -1 });
  db.readings.createIndex({ organizationId: 1, timestamp: -1 });
  return db.readings.countDocuments();
}

// Prints each result document on one line.
function show(cursorOrArray, max = 20) {
  const rows = Array.isArray(cursorOrArray)
    ? cursorOrArray
    : cursorOrArray.toArray();
  rows.slice(0, max).forEach((r) => print('   ', JSON.stringify(r)));
  if (rows.length > max) print('    … ' + (rows.length - max) + ' more');
}

// Rounds a field in a $project/$set: round('$avgSpeed', 1).
function round(expr, places = 1) {
  return { $round: [expr, places] };
}
