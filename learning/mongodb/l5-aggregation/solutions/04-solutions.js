// Solutions — Exercise 04. Task 3 uses daily_vehicle_stats: run exercise 04 first.
load('/learning/l5-aggregation/lib/telemetry.js');
const org = 'org-north';
const TZ = 'Africa/Cairo';

section('1. Per code: distinct days and distinct vehicles');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, diagnostics: { $exists: true } } },
    { $unwind: '$diagnostics' },
    {
      $group: {
        _id: '$diagnostics.code',
        days: {
          $addToSet: {
            $dateToString: {
              date: '$timestamp',
              format: '%Y-%m-%d',
              timezone: TZ,
            },
          },
        },
        vehicles: { $addToSet: '$vehicleId' },
      },
    },
    {
      $project: { days: { $size: '$days' }, vehicles: { $size: '$vehicles' } },
    },
    { $sort: { _id: 1 } },
  ]),
);

section('2. Vehicles with no high-severity P0300 on 6 October');
const anti = [
  { $match: { organizationId: org } },
  {
    $lookup: {
      from: 'readings',
      let: { org: '$organizationId', vid: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$organizationId', '$$org'] },
                { $eq: ['$vehicleId', '$$vid'] },
              ],
            },
            timestamp: {
              $gte: ISODate('2026-10-05T21:00:00Z'),
              $lt: ISODate('2026-10-06T21:00:00Z'),
            },
            diagnostics: { $elemMatch: { code: 'P0300', severity: 'high' } },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ],
      as: 'high',
    },
  },
  { $match: { high: { $size: 0 } } },
  { $project: { plate: 1 } },
];
show(db.vehicles.aggregate(anti));
const e = db.vehicles.explain('executionStats').aggregate(anti);
const lookupStage = e.stages.find((s) => s.$lookup);
print(
  '  inner pipeline: indexesUsed',
  JSON.stringify(lookupStage.indexesUsed),
  '| docs examined',
  lookupStage.totalDocsExamined,
);
// An anti-join is $lookup + "the joined array is empty". $limit: 1 inside the
// lookup stops at the first match: we only need to know whether one exists.
// The vehicles we are looking for are the expensive ones: with no match, their
// whole day (1 440 readings) is read. Anti-joins pay most for absent rows.
// The inner $match uses the ESR index { organizationId, vehicleId, timestamp }
// once per vehicle. Without that index, every vehicle would scan readings.
// ($expr equality in a $lookup pipeline can use indexes since MongoDB 5.0.)

section('3. Add refuels to the daily summary');
const before = db.daily_vehicle_stats.countDocuments();
db.readings.aggregate([
  { $match: { organizationId: org } },
  {
    $setWindowFields: {
      partitionBy: '$vehicleId',
      sortBy: { timestamp: 1 },
      output: { prevFuel: { $shift: { output: '$fuelLevel', by: -1 } } },
    },
  },
  {
    $group: {
      _id: {
        organizationId: '$organizationId',
        vehicleId: '$vehicleId',
        day: { $dateTrunc: { date: '$timestamp', unit: 'day', timezone: TZ } },
      },
      refuels: {
        $sum: {
          $cond: [
            { $gt: [{ $subtract: ['$fuelLevel', '$prevFuel'] }, 10] },
            1,
            0,
          ],
        },
      },
    },
  },
  {
    $merge: {
      into: 'daily_vehicle_stats',
      on: '_id',
      whenMatched: 'merge', // add the field, keep the others
      whenNotMatched: 'discard',
    },
  },
]);
print(
  '  summaries before/after:',
  before,
  '/',
  db.daily_vehicle_stats.countDocuments(),
);
show(
  db.daily_vehicle_stats
    .find({ '_id.vehicleId': 'v-101' }, { _id: 0, km: 1, refuels: 1 })
    .sort({ '_id.day': 1 }),
);
// whenMatched: 'merge' adds refuels to the existing summaries without
// recomputing the rest; 'discard' ignores days with no summary yet. Same _id,
// so the count cannot change.
