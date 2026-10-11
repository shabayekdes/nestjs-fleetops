// Learning Stage 5 — Exercise 04: arrays, joins and stored summaries
//
// Run: docker compose exec mongo mongosh --quiet learning_l5 /learning/l5-aggregation/04-unwind-lookup-summaries.js
//
// Concepts
// - $unwind turns one document with an array of N elements into N documents,
//   one per element. Then $group can count elements across documents.
// - $filter keeps matching elements INSIDE the array, without unwinding.
// - $lookup is a left outer join with another collection of the same
//   database. It runs once per input document, so where it sits in the
//   pipeline decides its cost. Tenant data: join on organizationId too.
// - $out replaces a whole collection with the pipeline's result. $merge
//   inserts or updates result documents into a collection: incremental,
//   idempotent summaries.
// - The track's retention rule: raw readings expire, summaries are kept.
//   Reports read the summaries.
//
// Access patterns:
//   S1  diagnostic codes per code and severity
//   S2  average driving speed per vehicle type (type lives in `vehicles`)
//   S3  a daily summary per vehicle, kept after raw readings expire

load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const org = 'org-north';
const TZ = 'Africa/Cairo';

section('1. S1: $unwind the diagnostics');
const withCodes = { organizationId: org, diagnostics: { $exists: true } };
print('  readings with diagnostics:', db.readings.countDocuments(withCodes));
print(
  '  after $unwind:',
  db.readings
    .aggregate([
      { $match: withCodes },
      { $unwind: '$diagnostics' },
      { $count: 'n' },
    ])
    .next().n,
  'documents (one per code)',
);
show(
  db.readings.aggregate([
    { $match: withCodes },
    { $unwind: '$diagnostics' },
    {
      $group: {
        _id: { code: '$diagnostics.code', severity: '$diagnostics.severity' },
        times: { $sum: 1 },
        vehicles: { $addToSet: '$vehicleId' },
      },
    },
    { $set: { vehicles: { $size: '$vehicles' } } },
    { $sort: { '_id.code': 1, '_id.severity': 1 } },
  ]),
);
// $unwind drops documents whose array is missing or empty, unless
// preserveNullAndEmptyArrays: true. That is why the $match comes first: it is
// both correct and cheaper.

section('2. $filter: keep matching elements in place');
show(
  db.readings.aggregate([
    { $match: { ...withCodes, vehicleId: 'v-101' } },
    {
      $project: {
        _id: 0,
        timestamp: 1,
        all: { $size: '$diagnostics' },
        high: {
          $filter: {
            input: '$diagnostics',
            as: 'd',
            cond: { $eq: ['$$d.severity', 'high'] },
          },
        },
      },
    },
    { $match: { 'high.0': { $exists: true } } },
    { $limit: 3 },
  ]),
);
// $$d is the current element. Each reading stays one document; only its array
// shrinks. Use $unwind to count ACROSS documents, $filter to trim WITHIN one.

section('3. Hourly buckets with $out, then $filter inside them (L2 deferred)');
db.readings.aggregate([
  { $match: { organizationId: org } },
  { $sort: { timestamp: 1 } },
  {
    $group: {
      _id: {
        organizationId: '$organizationId',
        vehicleId: '$vehicleId',
        hour: { $dateTrunc: { date: '$timestamp', unit: 'hour' } },
      },
      readings: { $push: { t: '$timestamp', speed: '$speed' } },
      maxSpeed: { $max: '$speed' },
    },
  },
  { $out: 'readings_hourly' },
]);
print('  readings_hourly:', db.readings_hourly.countDocuments(), 'buckets');
show(
  db.readings_hourly.aggregate([
    {
      $match: {
        '_id.organizationId': org,
        '_id.vehicleId': 'v-101',
        '_id.hour': ISODate('2026-10-05T05:00:00Z'),
      },
    },
    {
      $project: {
        _id: 0,
        inRange: {
          $filter: {
            input: '$readings',
            as: 'r',
            cond: {
              $and: [
                { $gte: ['$$r.t', ISODate('2026-10-05T05:05:00Z')] },
                { $lt: ['$$r.t', ISODate('2026-10-05T05:08:00Z')] },
              ],
            },
          },
        },
      },
    },
  ]),
);
// The bucket pattern from L2, built in one pipeline, and its range read done
// in the database: only 3 of the 60 readings leave the server.
// $out REPLACES the target collection on every run (all or nothing). Fine for
// a rebuild, wrong for incremental summaries: that is $merge (section 5).

section('4. S2: $lookup to vehicles — where to put it');
const joinVehicle = {
  $lookup: {
    from: 'vehicles',
    let: { org: '$organizationId', vid: '$vehicleId' },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$_id', '$$vid'] },
              { $eq: ['$organizationId', '$$org'] },
            ],
          },
        },
      },
      { $project: { _id: 0, type: 1, plate: 1 } },
    ],
    as: 'vehicle',
  },
};
function timed(label, pipeline) {
  const t0 = Date.now();
  const rows = db.readings.aggregate(pipeline).toArray();
  print('  ' + label.padEnd(26), String(Date.now() - t0).padStart(5), 'ms');
  return rows;
}
const late = timed('$lookup after $group', [
  { $match: { organizationId: org, speed: { $gt: 0 } } },
  {
    $group: {
      _id: { organizationId: '$organizationId', vehicleId: '$vehicleId' },
      sum: { $sum: '$speed' },
      n: { $sum: 1 },
    },
  },
  {
    $set: {
      organizationId: '$_id.organizationId',
      vehicleId: '$_id.vehicleId',
    },
  },
  joinVehicle,
  { $unwind: '$vehicle' },
  {
    $group: {
      _id: '$vehicle.type',
      avgSpeed: { $avg: { $divide: ['$sum', '$n'] } },
    },
  },
  { $set: { avgSpeed: round('$avgSpeed') } },
  { $sort: { _id: 1 } },
]);
const early = timed('$lookup on every reading', [
  { $match: { organizationId: org, speed: { $gt: 0 } } },
  joinVehicle,
  { $unwind: '$vehicle' },
  { $group: { _id: '$vehicle.type', avgSpeed: { $avg: '$speed' } } },
  { $set: { avgSpeed: round('$avgSpeed') } },
  { $sort: { _id: 1 } },
]);
show(late);
show(early);
// The first pipeline joins 4 grouped documents; the second joins ~7 000
// readings, one lookup each. Group first, join the small result.
// (Averaging per-vehicle averages equals the overall average here only because
// every vehicle of a type drives the same number of minutes; in general, carry
// sum and count through and divide at the end.)
// The join matches organizationId as well as the id: a reading must never be
// joined to another tenant's vehicle, even by mistake.

section('5. S3: a daily summary with $merge');
db.daily_vehicle_stats.drop();
function summarize(from, to) {
  return db.readings.aggregate([
    { $match: { organizationId: org, timestamp: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: {
          organizationId: '$organizationId',
          vehicleId: '$vehicleId',
          day: {
            $dateTrunc: { date: '$timestamp', unit: 'day', timezone: TZ },
          },
        },
        km: { $sum: { $divide: ['$speed', 60] } },
        drivingMinutes: { $sum: { $cond: [{ $gt: ['$speed', 0] }, 1, 0] } },
        idleMinutes: {
          $sum: {
            $cond: [{ $and: ['$engineOn', { $eq: ['$speed', 0] }] }, 1, 0],
          },
        },
        maxSpeed: { $max: '$speed' },
        readings: { $sum: 1 },
      },
    },
    { $set: { km: round('$km'), computedAt: '$$NOW' } },
    {
      $merge: {
        into: 'daily_vehicle_stats',
        on: '_id',
        whenMatched: 'replace',
        whenNotMatched: 'insert',
      },
    },
  ]);
}
// Day 1 only (Cairo 5 October = 4 Oct 21:00 UTC to 5 Oct 21:00 UTC).
summarize(ISODate('2026-10-04T21:00:00Z'), ISODate('2026-10-05T21:00:00Z'));
print('  after day 1:', db.daily_vehicle_stats.countDocuments(), 'summaries');
// All three days, including day 1 again.
summarize(ISODate('2026-10-04T21:00:00Z'), ISODate('2026-10-07T21:00:00Z'));
print(
  '  after all days (day 1 recomputed):',
  db.daily_vehicle_stats.countDocuments(),
  'summaries',
);
show(
  db.daily_vehicle_stats
    .find({ '_id.vehicleId': 'v-102' }, { computedAt: 0 })
    .sort({ '_id.day': 1 }),
);
// The summary's _id is (organization, vehicle, day), so re-running a day
// replaces its summaries instead of adding duplicates: the job is idempotent
// and can be re-run after late readings arrive. A nightly job would summarize
// "yesterday" (plus a few late days); the raw readings can then expire (L3 TTL).
// Only summarize COMPLETE days in the organization's time zone: a range that
// cuts a day in half would replace a full summary with half of one.

section('6. Reports read summaries, not raw readings');
const rawCost = db.readings.explain('executionStats').aggregate([
  { $match: { organizationId: org } },
  {
    $group: { _id: '$vehicleId', km: { $sum: { $divide: ['$speed', 60] } } },
  },
]);
const raw = (rawCost.stages ? rawCost.stages[0].$cursor : rawCost)
  .executionStats.totalDocsExamined;
const fromSummary = db.daily_vehicle_stats
  .aggregate([
    { $match: { '_id.organizationId': org } },
    { $group: { _id: '$_id.vehicleId', km: { $sum: '$km' } } },
    { $sort: { _id: 1 } },
  ])
  .toArray();
print('  3-day km per vehicle from raw readings: examines', raw, 'documents');
print(
  '  same from daily summaries:              reads',
  db.daily_vehicle_stats.countDocuments({ '_id.organizationId': org }),
  'documents',
);
show(fromSummary.map((r) => ({ ...r, km: Math.round(r.km * 10) / 10 })));
// A monthly report for 1 000 vehicles reads 30 000 summaries instead of 43
// million one-minute readings. Summaries are small enough to live in
// PostgreSQL next to the core data, if reports need to join them with it (a
// question for L8/L15).

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. For each diagnostic code in org-north: on how many distinct DAYS (Cairo)
//    was it reported, and by how many distinct vehicles?
// 2. Anti-join: vehicles of org-north that reported no high-severity P0300 on
//    6 October (Cairo). Start from `vehicles` and $lookup into `readings`. Check with
//    explain which index the inner pipeline uses.
// 3. Add `refuels` to daily_vehicle_stats (hint: exercise 03's $shift) and
//    re-run the summary for all days. Prove the count of summaries did not
//    change.
// ---------------------------------------------------------------------------
