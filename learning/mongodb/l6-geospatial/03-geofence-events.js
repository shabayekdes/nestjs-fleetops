// Learning Stage 6 — Exercise 03: geofence entry and exit events
//
// Run: docker compose exec mongo mongosh --quiet learning_l6 /learning/l6-geospatial/03-geofence-events.js
//
// Concepts
// - "Inside" is a state; "entered" and "exited" are EVENTS: a change between
//   two consecutive readings of the same vehicle.
// - MongoDB has no point-in-polygon EXPRESSION: $geoWithin works in a query
//   filter, but not inside $set / $cond. So "was the previous reading inside?"
//   cannot be computed for polygons in one pipeline.
// - Two ways to get events:
//     batch    for a circular fence, $geoNear gives every reading's distance
//              to the centre; then $shift (L5) finds the changes.
//     ingest   for each new reading, ask which fences contain it
//              ($geoIntersects, exercise 02), compare with the vehicle's
//              previous set of fences (stored state), write the differences.
// - Real GPS is noisy: a vehicle parked on a fence edge "enters" and "exits"
//   every minute. Events need debouncing.
//
// Access patterns:
//   E1  "v-101 arrived at the depot at 09:12" (an alert, a timeline entry)
//   E2  visits: how long each vehicle stayed in each fence

load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
const org = 'org-north';
const TZ = 'Africa/Cairo';
const cairo = (d) =>
  d.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});
db.geofences.createIndex({ organizationId: 1, area: '2dsphere' });

section('1. Batch, circular fence: $geoNear + $shift');
const depotCircle = { center: PLACES.depotNorth.center, radiusM: 400 };
show(
  db.readings.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: depotCircle.center },
        key: 'location',
        query: { organizationId: org, vehicleId: 'v-101' },
        distanceField: 'metres',
      },
    },
    { $set: { inside: { $lte: ['$metres', depotCircle.radiusM] } } },
    {
      $setWindowFields: {
        partitionBy: '$vehicleId',
        sortBy: { timestamp: 1 }, // back to time order after $geoNear
        output: { wasInside: { $shift: { output: '$inside', by: -1 } } },
      },
    },
    { $match: { $expr: { $and: [{ $ne: ['$wasInside', null] }, { $ne: ['$inside', '$wasInside'] }] } } },
    {
      $project: {
        _id: 0,
        event: { $cond: ['$inside', 'enter', 'exit'] },
        at: { $dateToString: { date: '$timestamp', format: '%H:%M', timezone: TZ } },
        metres: { $round: ['$metres', 0] },
      },
    },
  ]),
); // prettier-ignore
// $geoNear returns every reading of v-101 (no maxDistance) sorted by
// distance, with the distance attached; the window stage re-sorts by time.
// Works for circles only, and for one fence per pipeline.

section('2. Ingest-time events for polygon fences');
db.vehicleFenceState.drop();
db.vehicleFenceState.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true },
);
db.geofenceEvents.drop();

// Called for every incoming reading, in arrival order.
function onReading(r) {
  const now = db.geofences
    .find(
      { organizationId: r.organizationId, area: { $geoIntersects: { $geometry: r.location } } },
      { _id: 1 },
    )
    .toArray()
    .map((g) => g._id);
  const key = { organizationId: r.organizationId, vehicleId: r.vehicleId };
  const state = db.vehicleFenceState.findOne(key);
  if (state && state.timestamp >= r.timestamp) return; // late reading: no events
  const before = state ? state.fences : [];
  const events = [
    ...now.filter((f) => !before.includes(f)).map((f) => ({ type: 'enter', fenceId: f })),
    ...before.filter((f) => !now.includes(f)).map((f) => ({ type: 'exit', fenceId: f })),
  ];
  // First reading of a vehicle: we do not know where it was before, so no
  // events, only the initial state.
  if (state && events.length) {
    db.geofenceEvents.insertMany(events.map((e) => ({ ...key, ...e, at: r.timestamp })));
  }
  db.vehicleFenceState.updateOne(
    key,
    { $set: { fences: now, timestamp: r.timestamp } },
    { upsert: true },
  );
} // prettier-ignore

const t0 = Date.now();
db.readings
  .find({ organizationId: org })
  .sort({ timestamp: 1, vehicleId: 1 })
  .forEach(onReading);
print(
  '  processed',
  db.readings.countDocuments({ organizationId: org }),
  'readings in',
  Date.now() - t0,
  'ms',
);
print('  events written:', db.geofenceEvents.countDocuments());
const names = Object.fromEntries(
  db.geofences
    .find()
    .toArray()
    .map((g) => [g._id, g.name]),
);
db.geofenceEvents
  .find({ vehicleId: 'v-101' })
  .sort({ at: 1 })
  .limit(6)
  .forEach((e) =>
    print('   ', cairo(e.at), e.type.padEnd(5), names[e.fenceId]),
  );
// Any number of fences, any polygon. The cost is one indexed $geoIntersects,
// one state read and one state write per reading. In a real service the fences
// change rarely, so they can be cached in memory and tested in code; the
// stored state is what makes events survive a restart.
// The state update is not guarded: two workers processing the same vehicle at
// once could both emit the same event. One consumer per vehicle (L12) or a
// guarded upsert (L4) is needed in production.

section('3. GPS noise on a fence edge: flapping');
// A vehicle parked 3 m outside the north edge of the depot. Its GPS fixes
// scatter ±10 m around it, independently from one minute to the next.
const edgeY = PLACES.depotNorth.center[1] + PLACES.depotNorth.half;
const jitter = (m) =>
  ((((Math.sin(m * 12.9898 + 4.1414) * 43758.5453) % 1) + 1) % 1) - 0.5;
const parked = Array.from({ length: 60 }, (_, m) => ({
  organizationId: org,
  vehicleId: 'v-199',
  timestamp: new Date(START.getTime() + m * 60_000),
  location: {
    type: 'Point',
    coordinates: [PLACES.depotNorth.center[0], Math.round((edgeY + 0.00003 + jitter(m) * 0.0002) * 1e6) / 1e6],
  },
})); // prettier-ignore
parked.forEach(onReading);
print(
  '  parked 1 hour on the edge:',
  db.geofenceEvents.countDocuments({ vehicleId: 'v-199' }),
  'events',
);
// The truck never moved, and the timeline is full of arrivals and departures.

section('4. Debouncing: require N readings in a row');
db.vehicleFenceState.deleteMany({ vehicleId: 'v-199' });
db.geofenceEvents.deleteMany({ vehicleId: 'v-199' });
const N = 3;
function onReadingDebounced(r) {
  const now = db.geofences
    .find(
      { organizationId: r.organizationId, area: { $geoIntersects: { $geometry: r.location } } },
      { _id: 1 },
    )
    .toArray()
    .map((g) => g._id);
  const key = { organizationId: r.organizationId, vehicleId: r.vehicleId };
  const state = db.vehicleFenceState.findOne(key) ?? { fences: [], candidate: null, streak: 0 };
  // `fences` is the confirmed set; `candidate` is a different set seen
  // `streak` times in a row. Only after N readings does it become confirmed.
  const same = (a, b) => a.length === b.length && a.every((f) => b.includes(f));
  let { fences, candidate, streak } = state;
  if (same(now, fences)) {
    candidate = null;
    streak = 0;
  } else if (candidate && same(now, candidate)) {
    streak += 1;
  } else {
    candidate = now;
    streak = 1;
  }
  if (streak >= N) {
    const events = [
      ...now.filter((f) => !fences.includes(f)).map((f) => ({ type: 'enter', fenceId: f })),
      ...fences.filter((f) => !now.includes(f)).map((f) => ({ type: 'exit', fenceId: f })),
    ];
    if (state.timestamp && events.length) {
      db.geofenceEvents.insertMany(events.map((e) => ({ ...key, ...e, at: r.timestamp })));
    }
    fences = now;
    candidate = null;
    streak = 0;
  }
  db.vehicleFenceState.updateOne(
    key,
    { $set: { fences, candidate, streak, timestamp: r.timestamp } },
    { upsert: true },
  );
} // prettier-ignore
parked.forEach(onReadingDebounced);
print(
  '  same hour, debounced (N = ' + N + '):',
  db.geofenceEvents.countDocuments({ vehicleId: 'v-199' }),
  'events',
);
// The price is latency: a real arrival is reported N readings late (3 minutes
// here). Other options: a buffer (enter at −20 m inside the edge, exit at +20 m
// outside: hysteresis), or a minimum dwell time. Tune them on real data.

section('5. E2: visits from events');
show(
  db.geofenceEvents.aggregate([
    { $match: { organizationId: org, vehicleId: { $ne: 'v-199' } } },
    {
      $setWindowFields: {
        partitionBy: { v: '$vehicleId', f: '$fenceId' },
        sortBy: { at: 1 },
        output: { next: { $shift: { output: { type: '$type', at: '$at' }, by: 1 } } },
      },
    },
    { $match: { type: 'enter', 'next.type': 'exit' } },
    {
      $group: {
        _id: '$fenceId',
        visits: { $sum: 1 },
        avgMinutes: { $avg: { $dateDiff: { startDate: '$at', endDate: '$next.at', unit: 'minute' } } },
      },
    },
    { $set: { avgMinutes: { $round: ['$avgMinutes', 1] } } },
    { $sort: { _id: 1 } },
  ]),
); // prettier-ignore
// Pair each "enter" with the next event for the same vehicle and fence; if it
// is an "exit", that is a complete visit. A visit still open at the end of the
// data has no exit yet and is left out.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Batch method for org-south: arrivals ("enter" events) of each org-south
//    vehicle at a 300 m circle around the south depot centre.
// 2. A visits table for v-102: fence name, arrival and departure in Cairo
//    time, duration in minutes.
// 3. Send v-101's readings to onReading() in a shuffled order (fresh state
//    and events). How many events now, compared with time order? Which line of
//    onReading() limits the damage, and what does it cost?
// ---------------------------------------------------------------------------
