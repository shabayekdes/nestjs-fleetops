// Learning Stage 2 — Exercise 04: the bucket pattern for telemetry
//
// Run: docker compose exec mongo mongosh --quiet learning_l2 /learning/l2-data-modeling/04-bucket-pattern.js
//
// Concepts
// - Between "one document per reading" (many tiny documents) and "all readings
//   in the vehicle" (one unbounded document) there is a middle shape: one
//   document per vehicle per hour, holding that hour's readings in an array.
// - The array is BOUNDED: an hour at one reading per 10 s is at most 360.
// - Fewer documents means fewer index entries and less per-document overhead.
//   The price: writes are $push into an existing document, and a query returns
//   whole hours, so filtering inside the hour is extra work.
// - MongoDB time series collections (5.0+) do this bucketing internally while
//   you still insert one reading at a time. They are an L3 topic; this
//   exercise builds buckets by hand so the trade-off is visible.

load('/learning/l2-data-modeling/lib/fleet.js');
db.readings_flat.drop();
db.readings_hourly.drop();

const VEHICLES = 20;
const HOURS = 6;
const PER_HOUR = 360; // one reading every 10 s
const start = ISODate('2026-10-05T06:00:00Z');
const vehicleIds = Array.from({ length: VEHICLES }, (_, n) => 'v-' + (101 + n));

section('1. Load the same data both ways');
// Flat: one document per reading.
for (const vehicleId of vehicleIds) {
  const batch = [];
  for (let i = 0; i < HOURS * PER_HOUR; i++) {
    batch.push({
      organizationId: 'org-north',
      vehicleId,
      ...reading(vehicleId, start, i),
    });
  }
  db.readings_flat.insertMany(batch);
}
// Bucketed: one document per vehicle-hour.
for (const vehicleId of vehicleIds) {
  const buckets = [];
  for (let h = 0; h < HOURS; h++) {
    const readings = [];
    for (let j = 0; j < PER_HOUR; j++) {
      const { timestamp, speed, fuelLevel, engineOn, location } = reading(
        vehicleId,
        start,
        h * PER_HOUR + j,
      );
      readings.push({ t: timestamp, speed, fuelLevel, engineOn, location });
    }
    buckets.push({
      organizationId: 'org-north',
      vehicleId,
      hour: new Date(start.getTime() + h * 3_600_000),
      count: readings.length,
      // A small precomputed summary makes "max speed per hour" free to read.
      maxSpeed: Math.max(...readings.map((r) => r.speed)),
      readings,
    });
  }
  db.readings_hourly.insertMany(buckets);
}

section('2. Measured: document count and size');
const flat = collectionStats('readings_flat');
const hourly = collectionStats('readings_hourly');
print(
  'flat:   ',
  flat.count,
  'documents,',
  kb(flat.size),
  'total, avg',
  flat.avgObjSize,
  'bytes',
);
print(
  'hourly: ',
  hourly.count,
  'documents,',
  kb(hourly.size),
  'total, avg',
  kb(hourly.avgObjSize),
);
// The data is the same; the bucketed collection has 360× fewer documents and
// is smaller, because organizationId and vehicleId are stored once per hour
// instead of once per reading, and the field name `timestamp` became `t`.
// (Short field names matter at this volume: every name is stored in every
// document.) Fewer documents also means 360× fewer index entries later (L3).

section('3. R1: one vehicle, 08:05–08:06');
const from = ISODate('2026-10-05T08:05:00Z');
const to = ISODate('2026-10-05T08:06:00Z');
const flatRows = db.readings_flat
  .find({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    timestamp: { $gte: from, $lt: to },
  })
  .toArray();
print('flat:   ', flatRows.length, 'documents returned');
// Bucketed: find the hour, then pick the readings inside it. Here in the
// application; L5 does it in the database with $unwind / $filter.
const bucket = db.readings_hourly.findOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  hour: ISODate('2026-10-05T08:00:00Z'),
});
const inRange = bucket.readings.filter((r) => r.t >= from && r.t < to);
print(
  'hourly: 1 document returned,',
  bucket.readings.length,
  'readings transferred,',
  inRange.length,
  'used',
);
// Short ranges favor flat documents; long ranges and per-hour summaries favor
// buckets.

section('4. Writing into a bucket as readings arrive');
// The live path: push into the current hour's bucket, or create it. The
// `count < 360` filter caps the array, so the bucket can never grow unbounded.
function addReading(organizationId, vehicleId, rd) {
  const hour = new Date(
    Math.floor(rd.timestamp.getTime() / 3_600_000) * 3_600_000,
  );
  return db.readings_hourly.updateOne(
    { organizationId, vehicleId, hour, count: { $lt: PER_HOUR } },
    {
      $push: {
        readings: {
          t: rd.timestamp,
          speed: rd.speed,
          fuelLevel: rd.fuelLevel,
          engineOn: rd.engineOn,
          location: rd.location,
        },
      },
      $inc: { count: 1 },
      $max: { maxSpeed: rd.speed },
    },
    { upsert: true },
  );
}
const next = reading('v-101', ISODate('2026-10-05T12:00:00Z'), 0);
const res = addReading('org-north', 'v-101', next);
print('new hour → bucket created:', res.upsertedCount === 1);
const res2 = addReading(
  'org-north',
  'v-101',
  reading('v-101', ISODate('2026-10-05T12:00:00Z'), 1),
);
print('same hour → pushed into it:', res2.modifiedCount === 1);
// When an hour's bucket is full (count = 360), the filter no longer matches and
// the upsert starts a second bucket for the same hour — the bound always holds.
// Cost: each reading rewrites a growing (~45 KB when full) document, where the flat
// model only appends a 200-byte one. Duplicate deliveries also need care:
// $push does not know a reading was already added (L13: idempotency).

section('5. Choosing');
[
  'one document per reading  : simplest writes, easy short-range queries, most documents and index entries',
  'bucket per vehicle-hour   : fewer/smaller documents, cheap hourly summaries, more complex writes and reads',
  'all readings in vehicle   : unbounded — never',
  'time series collection    : bucketing done by MongoDB, flat inserts — evaluate in L3',
].forEach((l) => print('  ' + l));

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. Using readings_hourly only, print the maximum speed of v-105 for each hour.
//    How many documents did you need to read? How many would the flat
//    collection need?
// 2. Change the bucket size to one document per vehicle per DAY. How many
//    readings is that, and roughly how big is each document? Is that still a
//    reasonable bound?
// 3. A device goes offline and sends 2 hours of readings at once when it comes
//    back. Does addReading() still put each reading in the correct bucket?
// ---------------------------------------------------------------------------
