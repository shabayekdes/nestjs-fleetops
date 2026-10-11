// Learning Stage 4 — Exercise 04: bulk writes and partial failures
//
// Run: docker compose exec mongo mongosh --quiet learning_l4 /learning/l4-querying/04-bulk-writes.js
//
// Concepts
// - insertMany and bulkWrite send many operations in one round trip. They are
//   NOT a transaction: each document succeeds or fails on its own.
// - ordered: true (the default) stops at the first error; everything before it
//   is written, everything after it is not. ordered: false tries every
//   operation and reports all errors at the end.
// - The error (MongoBulkWriteError) carries the outcome: result.insertedCount
//   and writeErrors[], each with the index of the failed operation.
// - Devices retry. A batch that is sent twice must not create duplicates:
//   give each reading a natural unique key, and treat "duplicate key" as
//   "already stored".
//
// Access pattern: a device uploads readings in batches of a few hundred.

load('/learning/l4-querying/lib/telemetry.js');
const org = 'org-north';

// A batch of n readings for v-101, starting at minute `from`.
const batch = (from, n) =>
  Array.from({ length: n }, (_, k) => reading(org, 'v-101', from + k));

function reset() {
  db.ingest.drop();
  // The natural key of a reading: one reading per vehicle per timestamp.
  db.ingest.createIndex(
    { organizationId: 1, vehicleId: 1, timestamp: 1 },
    { unique: true, name: 'reading_key' },
  );
  db.ingest.createIndex({ location: '2dsphere' });
}

function summary(e) {
  return (
    'inserted ' +
    e.result.insertedCount +
    ', failed at ' +
    JSON.stringify(e.writeErrors.map((w) => [w.index, w.code]))
  );
}

section('1. ordered: true stops at the first error');
reset();
db.ingest.insertMany(batch(5, 1)); // minute 5 is already stored
try {
  db.ingest.insertMany(batch(0, 10)); // minutes 0–9
} catch (e) {
  print('  ', e.name + ':', summary(e));
}
print('  stored now:', db.ingest.countDocuments(), '(minutes 0–5 only)');
// Minutes 0–4 were written, 5 failed, 6–9 were never tried.

section('2. ordered: false tries everything');
reset();
db.ingest.insertMany(batch(5, 1));
try {
  db.ingest.insertMany(batch(0, 10), { ordered: false });
} catch (e) {
  print('  ', e.name + ':', summary(e));
}
print('  stored now:', db.ingest.countDocuments(), '(minutes 0–9)');
// For telemetry, readings are independent: unordered is the right default.
// Ordered is for operations that depend on the ones before them.

section('3. A retried batch is safe with a natural key');
reset();
const upload = batch(0, 20);
db.ingest.insertMany(upload.slice(0, 12)); // the connection dropped after 12
// The device does not know what was stored, so it sends all 20 again.
function ingest(readings) {
  try {
    const r = db.ingest.insertMany(readings, { ordered: false });
    return { inserted: r.insertedIds ? Object.keys(r.insertedIds).length : 0, duplicates: 0, failed: [] };
  } catch (e) {
    if (!e.writeErrors) throw e; // not a per-document problem (e.g. network)
    const duplicates = e.writeErrors.filter((w) => w.code === 11000);
    const failed = e.writeErrors.filter((w) => w.code !== 11000);
    return {
      inserted: e.result.insertedCount,
      duplicates: duplicates.length,
      failed: failed.map((w) => ({ index: w.index, code: w.code })),
    };
  }
} // prettier-ignore
print('  retry of 20:', JSON.stringify(ingest(upload)));
print('  stored:', db.ingest.countDocuments(), '(no duplicates)');
// Duplicates count as success: the reading is stored. Without the unique
// index, the retry would have stored 12 readings twice. (A time series
// collection cannot have that index: L3, and L13.)

section('4. Telling "already stored" from "bad reading"');
reset();
const mixed = batch(0, 6);
db.ingest.insertOne(mixed[1]);
mixed[3] = {
  ...mixed[3],
  location: { type: 'Point', coordinates: [30.04, 191] },
};
print('  result:', JSON.stringify(ingest(mixed)));
// Index 1: 11000, already stored → fine. Index 3: 16755, invalid location →
// will fail on every retry, so report it (dead-letter, log), do not retry it.
// Errors that are not per document (timeouts, network) mean "unknown outcome":
// retry the whole batch, which is safe because of section 3.

section('5. bulkWrite: different operations in one round trip');
reset();
db.latestPosition.drop();
db.latestPosition.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true },
);
db.ingest.insertOne(reading(org, 'v-101', 2));
const incoming = batch(0, 4);
try {
  db.ingest.bulkWrite(
    incoming.map((r) => ({ insertOne: { document: r } })),
    { ordered: false },
  );
} catch (e) {
  print('  insertedCount:', e.result.insertedCount);
  print('  insertedIds:  ', JSON.stringify(e.result.insertedIds));
  print(
    '  failed index: ',
    e.writeErrors.map((w) => w.index),
  );
}
// insertedIds is keyed by operation index; index 2 (the duplicate) is
// missing. Use writeErrors[].index to map a failure back to the reading you
// sent: the order of the result is the order of your array.
const newest = incoming[incoming.length - 1];
const r = db.latestPosition.bulkWrite([
  {
    updateOne: {
      filter: { organizationId: org, vehicleId: 'v-101' },
      update: { $max: { timestamp: newest.timestamp } },
      upsert: true,
    },
  },
  {
    updateOne: {
      filter: { organizationId: org, vehicleId: 'v-102' },
      update: { $max: { timestamp: newest.timestamp } },
      upsert: true,
    },
  },
]);
print(
  '  latestPosition bulkWrite: upserted',
  r.upsertedCount,
  '| modified',
  r.modifiedCount,
);
// The readings and the latest position are two writes to two collections.
// If the process dies between them, the position lags until the next reading.
// For telemetry that is acceptable (and self-healing); for money it would not
// be (transactions, L14).

section('6. Why batch at all: round trips');
const many = batch(0, 2000);
db.speed_test.drop();
let t0 = Date.now();
many.forEach((d) => db.speed_test.insertOne({ ...d }));
const oneByOne = Date.now() - t0;
db.speed_test.drop();
t0 = Date.now();
db.speed_test.insertMany(many.map((d) => ({ ...d })));
const batched = Date.now() - t0;
print(
  '  2 000 readings: insertOne ×2000',
  oneByOne,
  'ms | insertMany',
  batched,
  'ms',
);
// Each insertOne waits for its own round trip. Here the server is on the same
// machine; across a network the gap is much larger. The driver splits big
// batches itself (at most 100 000 operations or 48 MB per message).
db.speed_test.drop();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. An ordered insertMany of 10 readings fails at index 4 with a duplicate.
//    Write the code that finishes the job: what exactly do you resend?
// 2. From ingest()'s result, build the list of readings to send to a
//    "rejected readings" collection, with the error code and the time of
//    rejection. Insert it.
// 3. A batch has two readings with the same timestamp but different speeds
//    (a device bug). Which one is stored with ordered: false? Is that
//    deterministic? What would you rather do?
// ---------------------------------------------------------------------------
