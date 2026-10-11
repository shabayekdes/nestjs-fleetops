// Solutions — Exercise 03
load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const TZ = 'Africa/Cairo';
const perVehicle = { partitionBy: '$vehicleId', sortBy: { timestamp: 1 } };

section('1. Fuel efficiency per vehicle (org-north)');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-north' } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: { prevFuel: { $shift: { output: '$fuelLevel', by: -1 } } },
      },
    },
    { $set: { drop: { $subtract: ['$prevFuel', '$fuelLevel'] } } },
    {
      $group: {
        _id: '$vehicleId',
        firstOdo: { $min: '$odometer' },
        lastOdo: { $max: '$odometer' },
        fuelUsed: { $sum: { $cond: [{ $gt: ['$drop', 0] }, '$drop', 0] } },
        idleMinutes: {
          $sum: {
            $cond: [{ $and: ['$engineOn', { $eq: ['$speed', 0] }] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        km: round({ $subtract: ['$lastOdo', '$firstOdo'] }),
        fuelUsed: round('$fuelUsed'),
        kmPerPoint: round(
          { $divide: [{ $subtract: ['$lastOdo', '$firstOdo'] }, '$fuelUsed'] },
          2,
        ),
        idleMinutes: 1,
      },
    },
    { $sort: { kmPerPoint: 1 } },
  ]),
);
// v-102 is least efficient: it idles 15 minutes an hour, burning fuel without
// distance. Efficiency comparisons always need the idle time beside them.

section('2. When v-201 switched its engine off');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-south', vehicleId: 'v-201' } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          wasOn: { $shift: { output: '$engineOn', by: -1, default: false } },
        },
      },
    },
    { $match: { wasOn: true, engineOn: false } },
    {
      $project: {
        _id: 0,
        engineOffAt: {
          $dateToString: {
            date: '$timestamp',
            format: '%Y-%m-%d %H:%M',
            timezone: TZ,
          },
        },
      },
    },
  ]),
);
// A transition is "this reading differs from the previous one": $shift and a
// $match on both values. Engine-off is at 19:00 every day.

section('3. Longest idle episode per org-south vehicle');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-south' } },
    { $set: { idle: { $and: ['$engineOn', { $eq: ['$speed', 0] }] } } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          prevIdle: { $shift: { output: '$idle', by: -1, default: false } },
        },
      },
    },
    {
      $set: {
        starts: { $cond: [{ $and: ['$idle', { $not: '$prevIdle' }] }, 1, 0] },
      },
    },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          episode: {
            $sum: '$starts',
            window: { documents: ['unbounded', 'current'] },
          },
        },
      },
    },
    { $match: { idle: true } },
    {
      $group: {
        _id: { vehicleId: '$vehicleId', episode: '$episode' },
        from: { $min: '$timestamp' },
        minutes: { $sum: 1 },
      },
    },
    { $sort: { minutes: -1, from: 1 } },
    {
      $group: {
        _id: '$_id.vehicleId',
        minutes: { $first: '$minutes' },
        from: { $first: '$from' },
      },
    },
    {
      $project: {
        minutes: 1,
        from: {
          $dateToString: { date: '$from', format: '%m-%d %H:%M', timezone: TZ },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// Sort the episodes longest first, then $first per vehicle: the "top 1 per
// group" pattern. (MongoDB 5.2+ also has $top / $topN accumulators for it.)
