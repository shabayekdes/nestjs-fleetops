// Solutions — Exercise 04
load('/learning/l4-querying/lib/telemetry.js');
const org = 'org-north';
const batch = (from, n) =>
  Array.from({ length: n }, (_, k) => reading(org, 'v-101', from + k));

function reset() {
  db.ingest.drop();
  db.ingest.createIndex(
    { organizationId: 1, vehicleId: 1, timestamp: 1 },
    { unique: true },
  );
  db.ingest.createIndex({ location: '2dsphere' });
}

section('1. Finishing an ordered batch');
reset();
const readings = batch(0, 10);
db.ingest.insertOne({ ...readings[4] });
try {
  db.ingest.insertMany(readings);
} catch (e) {
  const failedAt = e.writeErrors[0].index;
  print('  stopped at index', failedAt, 'code', e.writeErrors[0].code);
  // 0..failedAt-1 are stored. failedAt is a duplicate (already stored), so
  // skip it; resend everything after it.
  const rest = readings.slice(failedAt + 1);
  db.ingest.insertMany(rest);
  print('  resent', rest.length, '→ stored', db.ingest.countDocuments());
}
// If the rest can contain duplicates too, this becomes a loop. Simpler: send
// unordered and treat 11000 as success (exercise 04, section 3).

section('2. A collection for rejected readings');
reset();
db.rejectedReadings.drop();
const mixed = batch(0, 6);
mixed[2] = { ...mixed[2], location: { type: 'Point', coordinates: [500, 30] } };
mixed[4] = { ...mixed[4], location: { type: 'Point', coordinates: [31.2] } };
try {
  db.ingest.insertMany(mixed, { ordered: false });
} catch (e) {
  const rejected = e.writeErrors
    .filter((w) => w.code !== 11000)
    .map((w) => ({
      organizationId: mixed[w.index].organizationId,
      reading: mixed[w.index],
      errorCode: w.code,
      error: w.errmsg.split(':')[0],
      rejectedAt: new Date(),
    }));
  db.rejectedReadings.insertMany(rejected);
}
db.rejectedReadings
  .find({}, { _id: 0, errorCode: 1, error: 1, 'reading.timestamp': 1 })
  .forEach((d) => print('  ', JSON.stringify(d)));
// writeErrors[].index points back into the array you sent. Keep the original
// reading so it can be inspected and replayed after a fix.

section('3. Two readings, same timestamp, different speeds');
reset();
const a = reading(org, 'v-101', 0);
const b = { ...a, speed: a.speed + 40 };
try {
  db.ingest.insertMany([{ ...a }, { ...b }], { ordered: false });
} catch (e) {
  print(
    '  failed index:',
    e.writeErrors.map((w) => w.index),
  );
}
print(
  '  stored speed:',
  db.ingest.findOne().speed,
  '(first one: ' + a.speed + ')',
);
// Here the first one won, but with ordered: false the server is allowed to
// apply operations in any order, so even inside one batch it is not
// guaranteed; across two batches, whichever arrives first wins. Better: record the conflict (the second reading in
// a rejected/conflict collection) so a device bug becomes visible instead of
// silently dropping data.
