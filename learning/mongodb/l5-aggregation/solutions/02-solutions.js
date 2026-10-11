// Solutions — Exercise 02
load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const TZ = 'Africa/Cairo';

section('1. Engine-on minutes per vehicle per Cairo day (org-south)');
show(
  db.readings.aggregate([
    { $match: { organizationId: 'org-south', engineOn: true } },
    {
      $group: {
        _id: {
          day: {
            $dateTrunc: { date: '$timestamp', unit: 'day', timezone: TZ },
          },
          vehicleId: '$vehicleId',
        },
        engineOnMinutes: { $sum: 1 },
      },
    },
    { $sort: { '_id.day': 1, '_id.vehicleId': 1 } },
  ]),
);
// The day is a Date at 21:00 UTC: Cairo midnight. Sorting by it is
// chronological, which a string label only is if its format is year-first.

section("2. Org-north's busiest Cairo hour on 6 October");
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: 'org-north',
        speed: { $gt: 0 },
        timestamp: {
          $gte: ISODate('2026-10-05T21:00:00Z'),
          $lt: ISODate('2026-10-06T21:00:00Z'),
        },
      },
    },
    {
      $group: {
        _id: { $hour: { date: '$timestamp', timezone: TZ } },
        vehicles: { $addToSet: '$vehicleId' },
        drivingMinutes: { $sum: 1 },
      },
    },
    { $set: { movingVehicles: { $size: '$vehicles' } } },
    { $sort: { movingVehicles: -1, drivingMinutes: -1, _id: 1 } },
    { $limit: 3 },
    { $project: { vehicles: 0 } },
  ]),
);
// Every working hour has all 4 vehicles moving, so the tie-breaker
// (driving minutes) decides. Distinct vehicles and minutes answer different
// questions: "how many trucks are out" vs "how much driving happens".

section('3. v-102 in 30-minute buckets, 10:00–12:00 Cairo on 6 October');
// Cairo is UTC+3 in October: 10:00 Cairo = 07:00 UTC.
const from = ISODate('2026-10-06T07:00:00Z');
const to = ISODate('2026-10-06T09:00:00Z');
show(
  db.aggregate([
    { $documents: [{ from, to }] },
    {
      $project: {
        _id: 0,
        from: {
          $dateToString: { date: '$from', format: '%H:%M', timezone: TZ },
        },
        to: { $dateToString: { date: '$to', format: '%H:%M', timezone: TZ } },
      },
    },
  ]),
);
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: 'org-north',
        vehicleId: 'v-102',
        speed: { $gt: 0 },
        timestamp: { $gte: from, $lt: to },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: '$timestamp', unit: 'minute', binSize: 30 },
        },
        avgSpeed: { $avg: '$speed' },
        drivingMinutes: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        cairo: {
          $dateToString: { date: '$_id', format: '%H:%M', timezone: TZ },
        },
        avgSpeed: round('$avgSpeed'),
        drivingMinutes: 1,
      },
    },
  ]),
);
