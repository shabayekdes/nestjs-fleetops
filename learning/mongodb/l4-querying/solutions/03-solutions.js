// Solutions — Exercise 03
load('/learning/l4-querying/lib/telemetry.js');
const org = 'org-north';

function reset() {
  db.latestPosition.drop();
  db.latestPosition.createIndex(
    { organizationId: 1, vehicleId: 1 },
    { unique: true },
  );
}
const pos = (time, lng) => ({
  timestamp: ISODate('2026-10-05T' + time + 'Z'),
  location: { type: 'Point', coordinates: [lng, 30.04] },
});

section('1. readingCount in the guarded upsert');
reset();
function applyCounting(organizationId, vehicleId, p) {
  try {
    db.latestPosition.updateOne(
      { organizationId, vehicleId, timestamp: { $lt: p.timestamp } },
      { $set: p, $inc: { readingCount: 1 } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
['09:00:00', '08:30:00', '09:10:00'].forEach((t) =>
  applyCounting(org, 'v-101', pos(t, 31.2)),
);
print(
  '  readingCount after 3 readings:',
  db.latestPosition.findOne().readingCount,
);
// 2, not 3: the stale reading failed the guard, so its $inc never ran. A count
// of readings received is not a "latest" value; it should count every reading.
// Keep it in a separate, unguarded update ({ $inc } with upsert), or derive it
// from the readings (L5).

section('2. How far did the vehicle move?');
reset();
function applyAndCompare(organizationId, vehicleId, p) {
  try {
    const previous = db.latestPosition.findOneAndUpdate(
      { organizationId, vehicleId, timestamp: { $lt: p.timestamp } },
      { $set: p },
      { upsert: true, returnDocument: 'before' },
    );
    if (!previous) return 'first position';
    const moved = p.location.coordinates[0] - previous.location.coordinates[0];
    return 'moved ' + moved.toFixed(3) + '° east';
  } catch (e) {
    if (e.code === 11000) return 'stale, ignored';
    throw e;
  }
}
print('  09:00:', applyAndCompare(org, 'v-101', pos('09:00:00', 31.2)));
print('  09:10:', applyAndCompare(org, 'v-101', pos('09:10:00', 31.26)));
print('  08:50:', applyAndCompare(org, 'v-101', pos('08:50:00', 31.1)));
// returnDocument: 'before' returns null when the upsert inserted.

section('3. The guard as a pipeline update (no error on stale readings)');
reset();
function applyPipeline(organizationId, vehicleId, p) {
  const newer = {
    $gt: [p.timestamp, { $ifNull: ['$timestamp', new Date(0)] }],
  };
  return db.latestPosition.updateOne(
    { organizationId, vehicleId },
    [
      {
        $set: {
          location: { $cond: [newer, { $literal: p.location }, '$location'] },
          timestamp: { $cond: [newer, p.timestamp, '$timestamp'] },
        },
      },
    ],
    { upsert: true },
  );
}
['09:00:00', '08:30:00', '09:10:00'].forEach((t, i) => {
  const r = applyPipeline(org, 'v-101', pos(t, 31.2 + i / 100));
  print('  ' + t, '→ upserted', r.upsertedCount, '| modified', r.modifiedCount);
});
print('  stored:', db.latestPosition.findOne().timestamp.toISOString());
// No exception for stale readings (matched but not modified), so a replayed
// backlog is cheap. The price: every field needs its own $cond, the update is
// harder to read, and $literal is needed so a value is not read as an
// expression. The unique index is still needed for concurrent first inserts.
