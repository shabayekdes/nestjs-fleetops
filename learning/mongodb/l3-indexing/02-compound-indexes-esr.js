// Learning Stage 3 — Exercise 02: compound indexes and the ESR rule
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/02-compound-indexes-esr.js
//
// Concepts
// - A compound index sorts by its first field, then by the second inside equal
//   first values, and so on, like a phone book sorted by (last name, first name).
// - Field order is the whole design. The equality–sort–range (ESR) rule:
//     1. Equality fields first  (organizationId: 'x', vehicleId: 'y')
//     2. then Sort fields        (sort by timestamp)
//     3. then Range fields       (speed > 100, timestamp >= …)
//   Equality fields narrow the index to one contiguous block. Inside that block
//   keys are already in sort order, so no in-memory SORT is needed. A range
//   before an equality field breaks the block into many pieces.
// - Prefix rule: { a, b, c } also serves queries on { a } and { a, b }, but not
//   on { b } or { c } alone.
// - Covered query: if the filter and the projection use only index fields
//   (and _id is excluded), MongoDB answers from the index without loading any
//   document: totalDocsExamined is 0.
//
// Access patterns for raw telemetry (one document per reading):
//   R1  one vehicle's readings in a time range, newest first   (vehicle page)
//   R2  one vehicle's latest reading                           (map marker)
//   R3  one organization's readings in a time range, newest first (activity)
//   R4  one vehicle's readings above a speed, newest first     (speeding)
// Every pattern starts with organizationId: tenant isolation is part of the
// filter, so it is the first field of every index.

load('/learning/l3-indexing/lib/telemetry.js');
print('readings:', seedReadings());

const org = 'org-north';
const vehicle = 'v-101';
const day1 = {
  $gte: ISODate('2026-10-05T00:00:00Z'),
  $lt: ISODate('2026-10-06T00:00:00Z'),
};
const r1 = () =>
  db.readings
    .find({ organizationId: org, vehicleId: vehicle, timestamp: day1 })
    .sort({ timestamp: -1 })
    .limit(100);

section('1. Range before equality: { organizationId, timestamp, vehicleId }');
db.readings.createIndex(
  { organizationId: 1, timestamp: 1, vehicleId: 1 },
  { name: 'org_time_vehicle' },
);
report('R1 (one vehicle, one day)', measure(r1()));
// The index walks org-north's readings of the day newest first, but they are
// interleaved across 30 vehicles: about 30 keys examined per reading of v-101.
// (No FETCH waste: vehicleId is in the index, so non-matching keys are skipped
// before any document is loaded. Index work is cheap, but it grows with the
// size of the tenant, not with the result.)
db.readings.dropIndexes();

section('2. ESR: { organizationId, vehicleId, timestamp: -1 }');
db.readings.createIndex(
  { organizationId: 1, vehicleId: 1, timestamp: -1 },
  { name: 'org_vehicle_time' },
);
report('R1 (one vehicle, one day)', measure(r1()));
// Equality on organizationId and vehicleId → one contiguous block of the
// index, already sorted by timestamp. Keys examined = documents returned.

section('3. R2: latest reading is one key');
report(
  'R2 (latest reading)',
  measure(
    db.readings
      .find({ organizationId: org, vehicleId: vehicle })
      .sort({ timestamp: -1 })
      .limit(1),
  ),
);
// The first key of v-101's block is its newest reading. This query stays at
// one key no matter how many years of telemetry the collection holds.

section('4. Direction: the same index walked backwards');
report(
  'R1 oldest first',
  measure(
    db.readings
      .find({ organizationId: org, vehicleId: vehicle, timestamp: day1 })
      .sort({ timestamp: 1 })
      .limit(100),
  ),
);
const plan = winningPlan(
  db.readings
    .find({ organizationId: org, vehicleId: vehicle })
    .sort({ timestamp: 1 })
    .explain(),
);
print('  scan direction:', plan.inputStage.direction);
// A single index can be read in either direction, so timestamp: -1 vs 1 only
// matters when a sort mixes directions, e.g. { vehicleId: 1, timestamp: -1 }.

section('5. Prefix rule');
report(
  'org only (prefix)',
  measure(db.readings.find({ organizationId: 'org-east' })),
);
report(
  'org + vehicle (prefix)',
  measure(db.readings.find({ organizationId: org, vehicleId: vehicle })),
);
report(
  'vehicle only (not a prefix)',
  measure(db.readings.find({ vehicleId: vehicle })),
);
// Without organizationId the index is unusable and the query falls back to a
// COLLSCAN. In FleetOps every tenant query has organizationId, so starting
// every index with it costs nothing and keeps tenants apart in the index too.

section('6. R3: one organization, one hour, newest first');
const r3 = () =>
  db.readings
    .find({
      organizationId: org,
      timestamp: {
        $gte: ISODate('2026-10-05T08:00:00Z'),
        $lt: ISODate('2026-10-05T09:00:00Z'),
      },
    })
    .sort({ timestamp: -1 });
report('R3 with org_vehicle_time', measure(r3()));
// org_vehicle_time has no bound on vehicleId, so it scans the hour inside each
// of the 30 vehicle blocks (the extra keys are the seeks between blocks). The
// results come out vehicle by vehicle, so a SORT stage merges them in memory.
db.readings.createIndex(
  { organizationId: 1, timestamp: -1 },
  { name: 'org_time' },
);
report('R3 with org_time', measure(r3()));
// Different access pattern, different index. Each index has a cost on every
// insert (exercise 05), so add one only for a pattern you really serve.

section('7. R4: equality + sort + range — where does speed go?');
const r4 = () =>
  db.readings
    .find({ organizationId: org, vehicleId: vehicle, speed: { $gt: 110 } })
    .sort({ timestamp: -1 });
report('R4 with org_vehicle_time', measure(r4()));
// E and S are in the index; the speed range is checked after FETCH: every
// reading of v-101 is loaded to keep the few above 110.

db.readings.createIndex(
  { organizationId: 1, vehicleId: 1, speed: 1 },
  { name: 'org_vehicle_speed (E, R)' },
);
db.readings.createIndex(
  { organizationId: 1, vehicleId: 1, timestamp: -1, speed: 1 },
  { name: 'org_vehicle_time_speed (E, S, R)' },
);
const ER = 'org_vehicle_speed (E, R)';
const ESR = 'org_vehicle_time_speed (E, S, R)';
report('R4 all, E-R', measure(r4().hint(ER)));
report('R4 all, E-S-R', measure(r4().hint(ESR)));
// E-R: a tight range (only matching keys), but the results come out in speed
// order, so a SORT stage reorders them in memory.
// E-S-R: walked in timestamp order, no SORT. The speed condition is checked on
// the index key, so only matching documents are loaded, but every key of v-101
// is examined.
report('R4 latest 10, E-R', measure(r4().limit(10).hint(ER)));
report('R4 latest 10, E-S-R', measure(r4().limit(10).hint(ESR)));
// With a limit the picture flips. E-S-R stops after the first 10 matches.
// E-R must find and sort ALL matches before it can return the first 10, so its
// cost grows with the vehicle's history; E-S-R's does not. In-memory sorts are
// also capped (100 MB per query) and use memory on the server.
report('R4 all, planner choice', measure(r4()));
report('R4 latest 10, planner choice', measure(r4().limit(10)));
// ESR is a rule of thumb, not a law: for "all matches" the planner can rightly
// prefer E-R. Paginated screens almost always have a limit, which favours ESR.
// With the limit, the planner picked org_vehicle_time (same first three fields,
// speed checked after FETCH): it and E-S-R tied in the trial. See section 9.

section('8. Covered query: answered from the index alone');
const chart = () =>
  db.readings
    .find(
      { organizationId: org, vehicleId: vehicle, timestamp: day1 },
      { _id: 0, timestamp: 1, speed: 1 },
    )
    .sort({ timestamp: -1 })
    .hint('org_vehicle_time_speed (E, S, R)');
report('speed chart, covered', measure(chart()));
// PROJECTION_COVERED, docsExamined 0: every field the query needs is in the
// index. Leave out `_id: 0` and the query is no longer covered (_id is not in
// this index), so every document must be loaded again.
report(
  'speed chart, _id included',
  measure(
    db.readings
      .find(
        { organizationId: org, vehicleId: vehicle, timestamp: day1 },
        { timestamp: 1, speed: 1 },
      )
      .sort({ timestamp: -1 })
      .hint('org_vehicle_time_speed (E, S, R)'),
  ),
);

section('9. Redundant indexes');
print(
  'indexes:',
  db.readings.getIndexes().map((i) => i.name),
);
// org_vehicle_time is a prefix of org_vehicle_time_speed, so the longer index
// already serves R1 and R2. Keeping both costs writes and memory for nothing.
// Rule of thumb: when one index is a prefix of another, drop the shorter one.

db.readings.dropIndexes();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. Idle report: one organization's readings with the engine off in one day,
//    newest first. Design the index with ESR, create it and show keys examined
//    = documents returned.
// 2. With only { organizationId: 1, vehicleId: 1, timestamp: -1 }, sort v-101's
//    readings by { vehicleId: 1, timestamp: 1 }. Is there a SORT stage? Then
//    sort by { timestamp: -1, speed: -1 }. Explain the difference.
// 3. Write a covered query for a fuel chart (timestamp and fuelLevel of one
//    vehicle for one day). Which index do you need? Prove docsExamined is 0.
// ---------------------------------------------------------------------------
