// Learning Stage 3 — Exercise 05: what indexes cost on writes
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/05-write-overhead.js
//
// Concepts
// - Every insert writes the document AND one key into every index (more for
//   multikey and geo indexes). Every delete removes them again.
// - An update only touches the indexes that contain a field it changed.
// - Indexes take disk space and, more importantly, memory: the indexes used by
//   hot queries should fit in RAM (the WiredTiger cache).
// - For telemetry, writes are the main load (device-driven, continuous), so
//   every index must earn its place.
//
// Times depend on your machine and on what else it is doing. Run the exercise
// twice; the TREND is the lesson, not the exact milliseconds.

load('/learning/l3-indexing/lib/telemetry.js');

const indexSets = [
  ['_id only', []],
  ['+ ESR index', [{ organizationId: 1, vehicleId: 1, timestamp: -1 }]],
  [
    '+ org_time',
    [
      { organizationId: 1, vehicleId: 1, timestamp: -1 },
      { organizationId: 1, timestamp: -1 },
    ],
  ],
  [
    '+ speed + engineOn',
    [
      { organizationId: 1, vehicleId: 1, timestamp: -1 },
      { organizationId: 1, timestamp: -1 },
      { organizationId: 1, vehicleId: 1, speed: 1 },
      { organizationId: 1, engineOn: 1, timestamp: -1 },
    ],
  ],
  [
    '+ 2dsphere',
    [
      { organizationId: 1, vehicleId: 1, timestamp: -1 },
      { organizationId: 1, timestamp: -1 },
      { organizationId: 1, vehicleId: 1, speed: 1 },
      { organizationId: 1, engineOn: 1, timestamp: -1 },
      { organizationId: 1, location: '2dsphere' },
    ],
  ],
];

section('1. Insert 144 000 readings with more and more indexes');
const results = [];
for (const [label, keys] of indexSets) {
  const coll = db.getCollection('write_test');
  coll.drop();
  keys.forEach((k) => coll.createIndex(k));
  const t0 = Date.now();
  forEachBatch((batch) => coll.insertMany(batch, { ordered: false }));
  const ms = Date.now() - t0;
  const s = storage('write_test');
  results.push({ label, ms });
  print(
    '  ' + label.padEnd(20),
    String(keys.length + 1).padStart(2),
    'indexes |',
    String(ms).padStart(5),
    'ms |',
    String(Math.round(144000 / (ms / 1000))).padStart(6),
    'inserts/s | data (on disk)',
    mb(s.storageSize).padStart(7),
    '| indexes',
    mb(s.totalIndexSize).padStart(7),
  );
}
// Each index adds insert time and disk. With all six, the indexes (9 MB) are
// larger than the compressed data itself (6 MB): indexes compress less well
// than documents.
print(
  '  slowdown, 6 indexes vs _id only: ×' +
    (results[results.length - 1].ms / results[0].ms).toFixed(1),
);

section('2. Index sizes, one by one');
Object.entries(storage('write_test').indexSizes).forEach(([name, bytes]) =>
  print('  ' + name.padEnd(44), mb(bytes).padStart(7)),
);
// Per million readings, multiply by ~7. A fleet of 1 000 vehicles at one
// reading per 10 s produces 8.6 million readings per day.

section('3. Updates: only the indexes on changed fields are touched');
// Uses the collection from the last run (6 indexes).
function timeUpdate(label, update) {
  const t0 = Date.now();
  const r = db.write_test.updateMany({ organizationId: 'org-east' }, update);
  print(
    '  ' + label.padEnd(36),
    String(r.modifiedCount).padStart(6),
    'docs |',
    String(Date.now() - t0).padStart(5),
    'ms',
  );
}
timeUpdate('$set a field in no index (note)', { $set: { note: 'checked' } });
timeUpdate('$inc speed (in 1 index)', { $inc: { speed: 1 } });
timeUpdate('$set timestamp (in 3 indexes)', [
  { $set: { timestamp: { $add: ['$timestamp', 1] } } },
]);
// Raw telemetry is append-only: readings are never updated, so only the
// insert cost matters. A latest-status document (L2) is the opposite: updated
// on every reading, so it should have as few indexes as possible on the
// fields that change.

section('4. Unused indexes');
db.write_test
  .find({ organizationId: 'org-north', vehicleId: 'v-101' })
  .limit(5)
  .toArray();
db.write_test
  .aggregate([{ $indexStats: {} }])
  .forEach((i) =>
    print('  ' + i.name.padEnd(44), 'used', Number(i.accesses.ops), 'times'),
  );
// $indexStats counts how often each index served a query since the server
// started (the updateMany filters in section 3 count too). An index that stays
// at 0 for a full business cycle is pure cost.
// (Atlas and Compass show the same numbers.)

db.write_test.drop();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/05-solutions.js)
//
// 1. From exercise 02's access patterns R1–R4, pick the smallest set of indexes
//    for raw telemetry. Measure its insert rate here and compare with
//    "_id only".
// 2. Estimate the index size for 30 days of a 1 000-vehicle fleet at one
//    reading per 10 s with your set from task 1. Would it fit in 1 GB of RAM?
// 3. Insert the readings in random order (shuffle each batch) into a collection
//    with only the ESR index. Is it slower than in time order? Why might it be?
// ---------------------------------------------------------------------------
