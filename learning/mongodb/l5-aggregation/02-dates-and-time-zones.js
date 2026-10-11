// Learning Stage 5 — Exercise 02: dates and time zones
//
// Run: docker compose exec mongo mongosh --quiet learning_l5 /learning/l5-aggregation/02-dates-and-time-zones.js
//
// Concepts
// - MongoDB stores dates as UTC instants. "Which day" or "which hour" a
//   reading belongs to depends on a time zone, so every grouping by calendar
//   unit must say which one.
// - Date operators take a `timezone`: $dateTrunc (round down to a unit),
//   $dateToString, $hour, $dayOfWeek, … Use an Olson name ('Africa/Cairo'),
//   not a fixed offset ('+03:00'): Egypt changes offset for daylight saving.
// - $dateTrunc with binSize makes chart buckets (every 15 minutes, 6 hours…).
// - $densify + $fill add the buckets that have no data, so a chart shows zero
//   instead of skipping the gap.
//
// Access patterns:
//   D1  average driving speed per vehicle per day (the fleet manager's day)
//   D2  activity by hour of the day (when is the fleet on the road?)
//   D3  a chart of one vehicle's speed in 15-minute buckets

load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const org = 'org-north';
const TZ = 'Africa/Cairo';

section('1. Readings per day: UTC vs Cairo');
for (const timezone of ['UTC', TZ]) {
  const days = db.readings
    .aggregate([
      { $match: { organizationId: org, vehicleId: 'v-101' } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$timestamp', unit: 'day', timezone } },
          readings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  print(
    '  ' + timezone.padEnd(13),
    days
      .map((d) => d._id.toISOString().slice(0, 16) + 'Z → ' + d.readings)
      .join(' | '),
  );
}
// The data covers exactly three Cairo days. Grouped by UTC day, it becomes
// four days, two of them partial. A Cairo day starts at 21:00 UTC of the day
// before, which is what the _id shows: $dateTrunc returns an instant.

section('2. D1: average driving speed per vehicle per Cairo day');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, speed: { $gt: 0 } } },
    {
      $group: {
        _id: {
          vehicleId: '$vehicleId',
          day: {
            $dateToString: {
              date: '$timestamp',
              format: '%Y-%m-%d',
              timezone: TZ,
            },
          },
        },
        avgSpeed: { $avg: '$speed' },
        drivingMinutes: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        vehicleId: '$_id.vehicleId',
        day: '$_id.day',
        avgSpeed: round('$avgSpeed'),
        drivingMinutes: 1,
      },
    },
    { $sort: { vehicleId: 1, day: 1 } },
  ]),
  6,
);
// A compound group key: one group per (vehicle, day). $project then flattens
// the key into ordinary fields for the API response.
// $dateToString gives a label ('2026-10-05'); $dateTrunc gives a Date. Use a
// Date if you will compare, sort or join on it; a label for display.

section('3. D2: activity by hour of the day');
function byHour(timezone) {
  return db.readings
    .aggregate([
      { $match: { organizationId: org, speed: { $gt: 0 } } },
      {
        $group: {
          _id: { $hour: { date: '$timestamp', timezone } },
          drivingMinutes: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()
    .map((h) => h._id);
}
print('  hours with driving, UTC:  ', byHour('UTC').join(' '));
print('  hours with driving, Cairo:', byHour(TZ).join(' '));
// Drivers work 07:00–19:00 local time. In UTC the same shift reads 04–15: a
// report in UTC tells a Cairo fleet manager their trucks drive at 4 am.

section('4. Fixed offset vs a real time zone');
show(
  db.aggregate([
    {
      $documents: [
        { t: ISODate('2026-10-06T21:30:00Z') },
        { t: ISODate('2026-12-01T21:30:00Z') },
      ],
    },
    {
      $project: {
        _id: 0,
        utc: '$t',
        fixedPlus3: {
          $dateToString: {
            date: '$t',
            format: '%Y-%m-%d %H:%M',
            timezone: '+03:00',
          },
        },
        cairo: {
          $dateToString: {
            date: '$t',
            format: '%Y-%m-%d %H:%M %z',
            timezone: TZ,
          },
        },
      },
    },
  ]),
);
// In October both say 00:30 the next day. In December Cairo is UTC+2 (daylight
// saving ended on 29 October), so the reading belongs to 1 December, but the
// fixed offset still puts it on 2 December. Store the organization's time zone
// as an Olson name and pass it to every date operator.
// ($documents feeds literal documents into a pipeline: handy for testing
// expressions without a collection.)

section('5. D3: a 15-minute chart with no gaps');
const from = ISODate('2026-10-05T03:00:00Z'); // 06:00 Cairo
const to = ISODate('2026-10-05T06:00:00Z'); // 09:00 Cairo
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: org,
        vehicleId: 'v-101',
        timestamp: { $gte: from, $lt: to },
        speed: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: '$timestamp', unit: 'minute', binSize: 15 },
        },
        avgSpeed: { $avg: '$speed' },
      },
    },
    {
      $densify: {
        field: '_id',
        range: { step: 15, unit: 'minute', bounds: [from, to] },
      },
    },
    { $fill: { output: { avgSpeed: { value: 0 } } } },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        cairoTime: {
          $dateToString: { date: '$_id', format: '%H:%M', timezone: TZ },
        },
        avgSpeed: round('$avgSpeed'),
      },
    },
  ]),
);
// The vehicle does not move before 07:00, so those buckets have no readings
// and $group produces nothing for them. $densify adds the missing bucket
// times; $fill sets their value. Without it a chart would draw a line straight
// from 06:00 to 07:00, or start at 07:00.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. Engine-on minutes per vehicle per Cairo day for org-south, with the day
//    as a Date (from $dateTrunc), sorted by day then vehicle.
// 2. Org-north's busiest Cairo hour: the hour in which the most DISTINCT
//    vehicles were moving on 6 October. Hint: $addToSet, then $size.
// 3. v-102's average driving speed in 30-minute buckets between 10:00 and
//    12:00 Cairo time on 6 October. Convert the bounds to UTC yourself first,
//    then check your conversion with $dateToString.
// ---------------------------------------------------------------------------
