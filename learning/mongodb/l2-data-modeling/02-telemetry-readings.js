// Learning Stage 2 — Exercise 02: telemetry readings and document boundaries
//
// Run: docker compose exec mongo mongosh --quiet learning_l2 /learning/l2-data-modeling/02-telemetry-readings.js
//
// Concepts
// - Readings are append-heavy and time-ordered. They are read by time range
//   ("last 30 minutes", "since 08:00") and almost never updated.
// - Embedding a full reading history inside a vehicle document is a trap: the
//   document grows forever and eventually exceeds MongoDB's 16 MB limit.
// - A common shape: one document per reading (the history) PLUS a small
//   "latest status" document per vehicle (fast current-state reads). The
//   second is not an alternative to the first; it is a read-optimized copy.
// - Exercise 04 shows a third option: bucketing readings per vehicle-hour.

load('/learning/l2-data-modeling/lib/fleet.js');
db.telemetry.drop();
db.vehicleStatus.drop();
db.vehicle_with_history.drop();

section('0. Access patterns');
[
  'W1  append a reading                        — 1 per vehicle every 10 s',
  'R1  readings of one vehicle in a time range — often (trip view, charts)',
  'R2  latest position/speed of every vehicle  — very often (live map)',
  'R3  daily summaries                         — L5 (aggregation)',
].forEach((p) => print('  ' + p));

section('1. History: one document per reading');
const start = ISODate('2026-10-05T08:00:00Z');
const docs = [];
for (const vehicleId of ['v-101', 'v-102']) {
  for (let i = 0; i < 90; i++) {
    // 90 readings = 15 minutes at one reading per 10 s
    docs.push({
      organizationId: 'org-north',
      vehicleId,
      ...reading(vehicleId, start, i),
    });
  }
}
db.telemetry.insertMany(docs);
print('readings stored:', db.telemetry.countDocuments());
print('one reading is', bsonsize(db.telemetry.findOne()), 'bytes');

// R1: a time range for one vehicle. Note the half-open range [$gte, $lt).
const r1 = db.telemetry
  .find(
    {
      organizationId: 'org-north',
      vehicleId: 'v-101',
      timestamp: {
        $gte: ISODate('2026-10-05T08:05:00Z'),
        $lt: ISODate('2026-10-05T08:06:00Z'),
      },
    },
    { _id: 0, timestamp: 1, speed: 1, fuelLevel: 1 },
  )
  .sort({ timestamp: 1 })
  .toArray();
print(
  'R1 08:05–08:06 for v-101:',
  r1.length,
  'readings, speeds',
  r1.map((x) => x.speed).join(', '),
);

section('2. Latest status: a small read-optimized document per vehicle');
// Maintained on every incoming reading with an upsert (L4 goes deeper).
// The filter includes the timestamp guard so a late, older reading arriving
// out of order can never overwrite a newer status.
function recordLatest(organizationId, vehicleId, rd) {
  db.vehicleStatus.updateOne(
    {
      _id: vehicleId,
      organizationId,
      lastTimestamp: { $not: { $gte: rd.timestamp } },
    },
    {
      $set: {
        organizationId,
        lastTimestamp: rd.timestamp,
        speed: rd.speed,
        fuelLevel: rd.fuelLevel,
        location: rd.location,
      },
    },
    { upsert: true },
  );
}
const latest = reading('v-101', start, 89);
recordLatest('org-north', 'v-101', latest);
try {
  // An older reading arrives late: the guard makes the filter miss, and the
  // upsert tries to insert a second document with the same _id → rejected.
  recordLatest('org-north', 'v-101', reading('v-101', start, 10));
} catch (e) {
  print('late reading ignored (duplicate key on upsert):', e.code === 11000);
}
printjson(
  db.vehicleStatus.findOne(
    { _id: 'v-101' },
    { _id: 1, lastTimestamp: 1, speed: 1 },
  ),
);
// R2 is now one small document per vehicle, regardless of how much history
// exists. The cost: two writes per reading, and the copy can be momentarily
// stale or wrong if the second write fails. Denormalization always trades
// write work and consistency for read speed.

section('3. Why not embed all readings in the vehicle document? (measured)');
// Build one vehicle document holding one day of readings (8 640 at 10 s).
const day = [];
for (let i = 0; i < 8640; i++) day.push(reading('v-101', start, i));
const vehicleWithDay = {
  _id: 'v-101',
  organizationId: 'org-north',
  plate: 'ABC-123',
  readings: day,
};
const perDay = bsonsize(vehicleWithDay);
print('vehicle + 1 day of readings:', kb(perDay));
print(
  'days until the 16 MB limit: ~' + Math.floor((16 * 1024 * 1024) / perDay),
);
// The limit is reached in about two weeks, but the document is a problem long
// before that: every new reading is a $push that rewrites a growing document,
// and every read of the vehicle (plate, status) drags the history along.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. Write a query that finds every reading for v-101 over 08:00–08:15 with
//    speed greater than 60.
// 2. Which document shape would you choose for a telemetry stream that stores
//    one reading each 10 seconds for 1000 vehicles: embedded under vehicle or a
//    dedicated collection? Explain in two sentences. How many documents per
//    day is that with one document per reading?
// 3. When does a denormalized `vehicleStatus` document help, and when is it a
//    problem?
// 4. Why does recordLatest() use the vehicle id as `_id` of vehicleStatus,
//    instead of letting MongoDB generate an ObjectId?
// ---------------------------------------------------------------------------
