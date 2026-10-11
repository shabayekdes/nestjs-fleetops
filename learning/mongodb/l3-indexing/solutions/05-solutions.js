// Solutions — Exercise 05
load('/learning/l3-indexing/lib/telemetry.js');

function loadInto(name, keys, shuffle = false) {
  const coll = db.getCollection(name);
  coll.drop();
  keys.forEach((k) => coll.createIndex(k));
  const t0 = Date.now();
  forEachBatch((batch) => {
    if (shuffle) {
      for (let i = batch.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [batch[i], batch[j]] = [batch[j], batch[i]];
      }
    }
    coll.insertMany(batch, { ordered: false });
  });
  return Date.now() - t0;
}

section('1. The smallest index set for R1–R4');
// R1, R2 and R4 (with a limit) are served by one E-S-R index; R3 needs its own.
const minimal = [
  { organizationId: 1, vehicleId: 1, timestamp: -1, speed: 1 },
  { organizationId: 1, timestamp: -1 },
];
const idOnly = loadInto('write_test', []);
const chosen = loadInto('write_test', minimal);
print('  _id only:', idOnly, 'ms | minimal set:', chosen, 'ms');
const s = storage('write_test');
print('  index size for 144 000 readings:', mb(s.totalIndexSize));

section('2. 30 days, 1 000 vehicles, one reading per 10 s');
const readings = 1000 * 8640 * 30;
const bytesPerReading = s.totalIndexSize / s.count;
print('  readings:', readings.toLocaleString());
print(
  '  index size ≈',
  ((readings * bytesPerReading) / 1024 ** 3).toFixed(1),
  'GB',
);
// About 259 million readings and several GB of indexes: it does NOT fit in 1 GB
// of RAM. Only the recent part of a time-ordered index is hot, which helps,
// but this is the scale where TTL, time series collections (exercise 06) and
// summaries instead of raw reads start to matter.

section('3. Random insert order');
const ordered = loadInto('write_test', [minimal[0]]);
const shuffled = loadInto('write_test', [minimal[0]], true);
print('  in time order:', ordered, 'ms | shuffled:', shuffled, 'ms');
// Usually somewhat slower. In time order each vehicle's new keys go next to
// the previous ones (the same index pages stay in cache). Shuffled inserts
// touch pages all over the index. On a data set this small everything fits in
// cache and the gap is small; it grows once the index no longer fits in RAM.
db.write_test.drop();
