// Learning Stage 3 — Exercise 06: time series collections
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/06-time-series.js
//
// Concepts
// - A time series collection looks like one document per reading when you
//   insert and query, but MongoDB stores readings in BUCKETS (one document per
//   series per time span, in a hidden system.buckets.<name> collection), stored
//   column by column and compressed. It is L2's bucket pattern, done for you.
// - timeField: the reading's time (required). metaField: what identifies the
//   series (here organizationId + vehicleId). Readings with the same meta and
//   close times share a bucket.
// - granularity ('seconds' | 'minutes' | 'hours') sets how long a bucket may
//   span: one hour, one day, 30 days. A bucket also closes at 1 000 readings.
// - Queries filter whole buckets first (by meta and each bucket's min/max
//   time), then unpack only those.
//
// This exercise compares three shapes for the same 144 000 readings:
//   flat     one document per reading + the ESR index (exercise 02)
//   ts_*     time series collections, two granularities

load('/learning/l3-indexing/lib/telemetry.js');

// Time series queries run as an aggregation over the buckets, so explain()
// has a different shape: the bucket-level plan is under stages[0].$cursor.
function measureTs(cursor) {
  const e = cursor.explain('executionStats');
  const inner = e.stages[0].$cursor;
  const s = inner.executionStats;
  return {
    plan: stageChain(winningPlan(inner)),
    index: indexUsed(winningPlan(inner)),
    keysExamined: s.totalKeysExamined,
    docsExamined: s.totalDocsExamined, // BUCKETS, not readings
    returned: s.nReturned, // buckets passed on to be unpacked
    ms: s.executionTimeMillis,
  };
}

// The series identity goes into meta; everything else is a measurement.
const toTs = ({ organizationId, vehicleId, ...m }) => ({
  meta: { organizationId, vehicleId },
  ...m,
});

section('1. Load the same readings three ways');
function load3(label, coll, mapFn = (b) => b) {
  const t0 = Date.now();
  forEachBatch((batch) => coll.insertMany(mapFn(batch), { ordered: false }));
  print('  ' + label.padEnd(12), String(Date.now() - t0).padStart(5), 'ms');
}
db.flat.drop();
db.flat.createIndex({ organizationId: 1, vehicleId: 1, timestamp: -1 });
load3('flat', db.flat);
for (const granularity of ['seconds', 'minutes']) {
  const name = 'ts_' + granularity;
  db.getCollection(name).drop();
  db.createCollection(name, {
    timeseries: { timeField: 'timestamp', metaField: 'meta', granularity },
  });
  load3(name, db.getCollection(name), (b) => b.map(toTs));
}
// Inserts are written one reading at a time, as with the flat collection: no
// hand-written $push into buckets. They were not faster here: the server does
// the bucketing work on every insert. The win is in storage and reads.

section('2. Storage');
print(
  '  ' + 'collection'.padEnd(12),
  'documents'.padStart(14),
  'data on disk'.padStart(13),
  'indexes'.padStart(10),
);
for (const name of ['flat', 'ts_seconds', 'ts_minutes']) {
  const s = storage(name);
  const docs =
    name === 'flat'
      ? s.count
      : db.getCollection('system.buckets.' + name).countDocuments() +
        ' buckets';
  print(
    '  ' + name.padEnd(12),
    String(docs).padStart(14),
    kb(s.storageSize).padStart(13),
    kb(s.totalIndexSize).padStart(10),
  );
}
// ts_seconds: 50 vehicles × 48 hours = 2 400 buckets of 60 readings.
// ts_minutes: a bucket may span a day, but closes at 1 000 readings, so each
// vehicle gets 3 buckets (2 880 readings). It is BIGGER than ts_seconds: each
// vehicle's last bucket (880 readings) is still open, and open buckets are
// only compressed when they close.
// Both are many times smaller than flat: in a bucket, organizationId and
// vehicleId are stored once and each column (all timestamps, all speeds, …)
// is compressed together. CAUTION: this synthetic data is very regular, so it
// compresses far better than real device data would. Expect a smaller (but
// still large) win in practice.

section('3. A bucket from the inside');
const bucket = db.getCollection('system.buckets.ts_seconds').findOne({
  'meta.vehicleId': 'v-101',
});
print('  bucket fields:', Object.keys(bucket).join(', '));
print('  meta:', JSON.stringify(bucket.meta));
print('  control.count:', bucket.control.count);
print('  control.min.timestamp:', bucket.control.min.timestamp.toISOString());
print('  control.max.timestamp:', bucket.control.max.timestamp.toISOString());
print(
  '  control.min/max speed:',
  bucket.control.min.speed,
  '/',
  bucket.control.max.speed,
);
// The min/max summary lets a query skip a whole bucket without unpacking it.
// Never write to system.buckets.* directly; read it only to learn.

section('4. Indexes on a time series collection');
print(
  '  ts_seconds indexes:',
  JSON.stringify(db.ts_seconds.getIndexes().map((i) => i.key)),
);
// 6.3+ creates { meta: 1, timestamp: 1 } automatically. It matches the WHOLE
// meta object only: a query on meta.organizationId + meta.vehicleId cannot
// use it. Tenant queries filter on the subfields, so add an index on them:
const r1 = {
  'meta.organizationId': 'org-north',
  'meta.vehicleId': 'v-101',
  timestamp: {
    $gte: ISODate('2026-10-05T08:00:00Z'),
    $lt: ISODate('2026-10-05T09:00:00Z'),
  },
};
print(
  '  R1 (one vehicle, one hour) returns',
  db.ts_seconds.countDocuments(r1),
  'readings',
);
report('R1, auto index only', measureTs(db.ts_seconds.find(r1)));
db.ts_seconds.createIndex({
  'meta.organizationId': 1,
  'meta.vehicleId': 1,
  timestamp: -1,
});
report('R1, meta subfields + time', measureTs(db.ts_seconds.find(r1)));
report(
  'R1 flat, ESR index',
  measure(
    db.flat.find({
      organizationId: 'org-north',
      vehicleId: 'v-101',
      timestamp: r1.timestamp,
    }),
  ),
);
// Without the index, the buckets are stored in time order (a clustered
// collection), so MongoDB scans only the buckets near the time window
// (CLUSTERED_IXSCAN), but those of every vehicle and every tenant.
// With it: a handful of keys, ONE bucket fetched and unpacked into 60 readings.
// The flat collection needs 60 keys and 60 documents for the same answer.

section('5. Latest reading per vehicle');
const latest = () =>
  db.ts_seconds
    .find({ 'meta.organizationId': 'org-north', 'meta.vehicleId': 'v-101' })
    .sort({ timestamp: -1 })
    .limit(1);
report('latest, time series', measureTs(latest()));
print('  latest:', latest().toArray()[0].timestamp.toISOString());
report(
  'latest, flat ESR',
  measure(
    db.flat
      .find({ organizationId: 'org-north', vehicleId: 'v-101' })
      .sort({ timestamp: -1 })
      .limit(1),
  ),
);
// The time series query fetches every bucket of the vehicle (48) to find the
// newest reading: its cost grows with history. The flat ESR index reads 1 key.
// For the map's "where is every vehicle now", L2's latest-status document is
// still the right tool next to a time series collection.

section('6. What a time series collection does not allow (7.0)');
function tryIt(label, fn) {
  try {
    const r = fn();
    print('  ' + label + ': ok', r?.modifiedCount ?? r?.deletedCount ?? '');
  } catch (e) {
    print('  ' + label + ': rejected, ' + e.message.slice(0, 100));
  }
}
tryIt('unique index on meta + timestamp', () =>
  db.ts_seconds.createIndex(
    { 'meta.vehicleId': 1, timestamp: 1 },
    { unique: true },
  ),
);
tryIt('correct one reading (updateOne)', () =>
  db.ts_seconds.updateOne(
    { 'meta.vehicleId': 'v-101' },
    { $set: { speed: 0 } },
  ),
);
tryIt('update a measurement (updateMany)', () =>
  db.ts_seconds.updateMany(
    { 'meta.vehicleId': 'v-101' },
    { $set: { speed: 0 } },
  ),
);
tryIt('update the meta (updateMany)', () =>
  db.ts_seconds.updateMany(
    { 'meta.vehicleId': 'v-105' },
    { $set: { 'meta.vehicleId': 'v-105b' } },
  ),
);
tryIt("delete a vehicle's readings", () =>
  db.ts_seconds.deleteMany({ 'meta.vehicleId': 'v-105b' }),
);
// - No unique index: a duplicate delivery of the same reading cannot be
//   rejected by the database (idempotency is an L13 problem).
// - Measurements are effectively immutable. Fine for raw telemetry, which is
//   never corrected in place; wrong for anything with a lifecycle.
// - You cannot convert an existing collection: choose the shape up front.

section('7. Late readings open new buckets');
const bucketsBefore = db
  .getCollection('system.buckets.ts_seconds')
  .countDocuments();
db.ts_seconds.insertOne(
  toTs({
    ...reading('org-north', 'v-101', 510),
    timestamp: ISODate('2026-10-05T08:30:30Z'), // an hour already bucketed
  }),
);
print(
  '  buckets before/after one late reading:',
  bucketsBefore,
  '/',
  db.getCollection('system.buckets.ts_seconds').countDocuments(),
);
// The 08:00 bucket of v-101 was already closed, so the late reading got a
// bucket of its own. A device that uploads hours of buffered readings makes
// many small buckets, which compress and query worse.

section('8. Retention: expireAfterSeconds on the collection');
db.runCommand({ collMod: 'ts_seconds', expireAfterSeconds: 30 * 24 * 3600 });
print(
  '  expireAfterSeconds:',
  Number(
    db.getCollectionInfos({ name: 'ts_seconds' })[0].options.expireAfterSeconds,
  ),
);
// A time series collection removes a whole BUCKET once its newest reading is
// older than the limit: one delete per bucket instead of one per reading
// (exercise 03's TTL index on a flat collection).

section('9. Choosing the telemetry shape (the question left open in L2)');
[
  'flat + ESR index      : simplest; any update and unique index; biggest; 1-key latest reading',
  'hand-built buckets    : small, but you write the bucketing, late data and dedup logic yourself',
  'time series collection: small and simple to write; no unique, immutable readings, late data = extra buckets',
].forEach((l) => print('  ' + l));
// The decision for this track is in NOTES.md.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/06-solutions.js)
//
// 1. Readings arrive every 10 s in production. Which granularity would you
//    pick, and how many readings would a bucket hold? Create a collection with
//    bucketMaxSpanSeconds / bucketRoundingSeconds (6.3+) instead of a
//    granularity and explain the trade-off.
// 2. "Readings above 110 km/h for v-101 on 5 Oct": measure it on ts_seconds.
//    How many buckets are fetched? Why can control.max.speed help here?
// 3. Put only vehicleId in meta and organizationId as a measurement. Load the
//    data and repeat R1. What goes wrong for tenant queries?
// ---------------------------------------------------------------------------
