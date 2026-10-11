// Learning Stage 4 — Exercise 03: atomic updates and upserts
//
// Run: docker compose exec mongo mongosh --quiet learning_l4 /learning/l4-querying/03-atomic-updates-and-upserts.js
//
// Concepts
// - Every update of ONE document is atomic: its filter is checked and all its
//   operators are applied together, with no other write in between.
// - So do the arithmetic in the database ($inc, $max, $push), not in the
//   application (read, change, write back): the read-modify-write version
//   loses updates when two writers interleave.
// - Upsert: update the matching document, or insert one built from the
//   filter's equality fields plus the update. $setOnInsert applies only to
//   that insert.
// - An upsert whose filter does not match an EXISTING document inserts a new
//   one. Without a unique index, that is how duplicates are born.
//
// Access pattern: the map shows each vehicle's latest position. Readings
// arrive late and out of order (buffered devices, retries), so "latest" must
// mean "newest timestamp", not "last write".

load('/learning/l4-querying/lib/telemetry.js');
const org = 'org-north';

section('1. Update operators on a status document');
db.vehicleStatus.drop();
const key = { organizationId: org, vehicleId: 'v-101' };
const r1 = db.vehicleStatus.updateOne(
  key,
  {
    $set: { speed: 64 },
    $inc: { readingCount: 1 },
    $max: { maxSpeed: 64 },
    $min: { firstSeenAt: ISODate('2026-10-05T06:00:00Z') },
    $currentDate: { updatedAt: true },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
print(
  '  first call:  upserted',
  r1.upsertedCount,
  '| modified',
  r1.modifiedCount,
);
const r2 = db.vehicleStatus.updateOne(key, {
  $set: { speed: 30 },
  $inc: { readingCount: 1 },
  $max: { maxSpeed: 30 },
  $min: { firstSeenAt: ISODate('2026-10-05T07:00:00Z') },
  $currentDate: { updatedAt: true },
});
print(
  '  second call: upserted',
  r2.upsertedCount,
  '| modified',
  r2.modifiedCount,
);
print('  ', JSON.stringify(db.vehicleStatus.findOne(key, { _id: 0 })));
// $max kept 64 and $min kept 06:00: they only write when the new value wins.
// The insert copied organizationId and vehicleId from the filter.

section('2. Read-modify-write loses updates');
db.counters.drop();
db.counters.insertOne({ _id: 'v-101', readings: 0 });
// Two workers process a reading each. Both read before either writes:
const seenByA = db.counters.findOne({ _id: 'v-101' }).readings;
const seenByB = db.counters.findOne({ _id: 'v-101' }).readings;
db.counters.updateOne({ _id: 'v-101' }, { $set: { readings: seenByA + 1 } });
db.counters.updateOne({ _id: 'v-101' }, { $set: { readings: seenByB + 1 } });
print('  read-modify-write, 2 readings →', db.counters.findOne().readings);
db.counters.updateOne({ _id: 'v-101' }, { $set: { readings: 0 } });
db.counters.updateOne({ _id: 'v-101' }, { $inc: { readings: 1 } });
db.counters.updateOne({ _id: 'v-101' }, { $inc: { readings: 1 } });
print('  $inc,              2 readings →', db.counters.findOne().readings);
// Same idea as `increment` in Prisma vs reading then writing a value.

section('3. findOneAndUpdate: change and get the document in one step');
db.alerts.drop();
db.alerts.insertMany([
  { organizationId: org, vehicleId: 'v-101', kind: 'speeding', status: 'new', at: ISODate('2026-10-05T08:00:00Z') },
  { organizationId: org, vehicleId: 'v-102', kind: 'idling', status: 'new', at: ISODate('2026-10-05T08:05:00Z') },
]); // prettier-ignore
const claim = (worker) =>
  db.alerts.findOneAndUpdate(
    { organizationId: org, status: 'new' },
    { $set: { status: 'claimed', claimedBy: worker } },
    { sort: { at: 1 }, returnDocument: 'after' },
  );
const a = claim('worker-a');
const b = claim('worker-b');
const c = claim('worker-c');
print(
  '  worker-a got:',
  a.kind,
  '| worker-b got:',
  b.kind,
  '| worker-c got:',
  c,
);
// The filter and the update are one atomic step, so two workers can never
// claim the same alert (the "take one if available" pattern from L1).
// returnDocument: 'before' returns the document as it was before the change.

section('4. The naive latest-position upsert');
db.latestPosition.drop();
db.latestPosition.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true },
);
const pos = (time, lng) => ({
  timestamp: ISODate('2026-10-05T' + time + 'Z'),
  location: { type: 'Point', coordinates: [lng, 30.04] },
});
function applyNaive(organizationId, vehicleId, p) {
  db.latestPosition.updateOne(
    { organizationId, vehicleId },
    { $set: p },
    { upsert: true },
  );
}
applyNaive(org, 'v-101', pos('09:00:00', 31.25));
applyNaive(org, 'v-101', pos('08:30:00', 31.2)); // late reading arrives last
print(
  '  stored:',
  db.latestPosition.findOne({ vehicleId: 'v-101' }).timestamp.toISOString(),
  '← the 08:30 reading overwrote 09:00',
);

section('5. A guarded upsert');
// Only update if the stored reading is OLDER. Put the guard in the filter.
function applyReading(organizationId, vehicleId, p) {
  try {
    const r = db.latestPosition.updateOne(
      { organizationId, vehicleId, timestamp: { $lt: p.timestamp } },
      { $set: p },
      { upsert: true },
    );
    return r.upsertedCount ? 'inserted' : 'updated';
  } catch (e) {
    // The guard did not match, so the upsert tried to INSERT a second
    // document for this vehicle, and the unique index refused it: the stored
    // position is newer (or the same). Nothing to do.
    if (e.code === 11000) return 'ignored (stale)';
    throw e;
  }
}
db.latestPosition.deleteMany({});
print('  09:00 →', applyReading(org, 'v-101', pos('09:00:00', 31.25)));
print('  08:30 →', applyReading(org, 'v-101', pos('08:30:00', 31.2)));
print('  09:10 →', applyReading(org, 'v-101', pos('09:10:00', 31.3)));
print(
  '  stored:',
  db.latestPosition.findOne({ vehicleId: 'v-101' }).timestamp.toISOString(),
);
// The duplicate-key error IS the "stale" signal. That only works because of
// the unique index on { organizationId, vehicleId }.

section('6. The same guard without a unique index');
db.latestPosition.dropIndexes();
db.latestPosition.deleteMany({});
applyReading(org, 'v-101', pos('09:00:00', 31.25));
applyReading(org, 'v-101', pos('08:30:00', 31.2));
print(
  '  documents for v-101:',
  db.latestPosition.countDocuments({ vehicleId: 'v-101' }),
);
// No error, two documents: the stale reading was INSERTED as a new "latest
// position". Every guarded upsert needs a unique index on the equality fields
// of its filter. The same index also protects against two concurrent first
// upserts both inserting.

section('7. Order does not matter any more');
db.latestPosition.drop();
db.latestPosition.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true },
);
seedReadings();
const all = db.readings.find({ organizationId: org }).toArray();
// Shuffle: deliver every reading of org-north in random order.
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [all[i], all[j]] = [all[j], all[i]];
}
const outcome = {};
for (const r of all) {
  const res = applyReading(r.organizationId, r.vehicleId, {
    timestamp: r.timestamp,
    speed: r.speed,
  });
  outcome[res] = (outcome[res] ?? 0) + 1;
}
print('  outcomes:', JSON.stringify(outcome));
const wrongCount = db.latestPosition
  .find({ organizationId: org })
  .toArray()
  .filter(
    (p) =>
      p.timestamp.getTime() !==
      db.readings
        .find({ organizationId: org, vehicleId: p.vehicleId })
        .sort({ timestamp: -1 })
        .limit(1)
        .next()
        .timestamp.getTime(),
  ).length;
print(
  '  vehicles whose stored position is not their newest reading:',
  wrongCount,
);

// The outcome counts change on every run (random order); the last line is
// always 0. In random order most deliveries are stale, and here each stale one
// costs a failed write and an exception. Fine for occasional late readings;
// for a device that replays hours of backlog, task 3's version avoids it.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Add readingCount to latestPosition. Should a stale reading increase it?
//    With applyReading() as written, can it? What does that tell you about
//    keeping counters and "latest" values in the same guarded update?
// 2. Use findOneAndUpdate with returnDocument: 'before' in the guarded upsert
//    so you can print how far (in longitude) the vehicle moved since the
//    previous position.
// 3. Write the guard without relying on an error: an update with an
//    aggregation pipeline that keeps the stored fields when the new timestamp
//    is not newer ($cond). What does it cost compared with section 5?
// ---------------------------------------------------------------------------
