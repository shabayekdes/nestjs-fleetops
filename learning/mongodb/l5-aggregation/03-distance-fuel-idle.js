// Learning Stage 5 — Exercise 03: distance, fuel and idle time
//
// Run: docker compose exec mongo mongosh --quiet learning_l5 /learning/l5-aggregation/03-distance-fuel-idle.js
//
// Concepts
// - Some summaries are simple totals ($group). Others depend on the reading
//   BEFORE this one: fuel used is a sum of drops, a refuel is a jump, an idle
//   episode starts when the previous minute was not idle.
// - $setWindowFields computes, for every document, a value over a window of
//   neighbouring documents of the same partition (here: the same vehicle, in
//   time order), without collapsing them like $group does:
//     $shift     the value N documents before/after
//     $sum/$avg  over a window: running totals, moving averages
//     $integral  the area under a curve (speed over time = distance)
// - Gaps and islands: to find runs of consecutive readings (idle episodes),
//   mark where a run starts, then a running sum of the marks numbers the runs.
//
// Access patterns:
//   F1  distance per vehicle per day
//   F2  refuel events, and fuel used per day
//   F3  idle minutes per day, and long idle episodes (an alert)

load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const org = 'org-north';
const TZ = 'Africa/Cairo';
const cairoDay = {
  $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: TZ },
};
// Every window below runs per vehicle, in time order.
const perVehicle = { partitionBy: '$vehicleId', sortBy: { timestamp: 1 } };

section('1. F1: distance per day from the odometer');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, vehicleId: { $in: ['v-101', 'v-102'] } } },
    {
      $group: {
        _id: { vehicleId: '$vehicleId', day: cairoDay },
        first: { $min: '$odometer' },
        last: { $max: '$odometer' },
      },
    },
    { $set: { km: round({ $subtract: ['$last', '$first'] }) } },
    { $unset: ['first', 'last'] },
    { $sort: { '_id.vehicleId': 1, '_id.day': 1 } },
  ]),
);
// The odometer only grows, so max − min is the distance within the day. It
// misses the distance between the last reading of one day and the first of the
// next (zero here: the vehicles are parked at midnight). An odometer that
// resets (a replaced device) breaks it: that needs the $shift approach below.

section('2. The same distance from speed × time: $integral');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, vehicleId: 'v-101' } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          kmSoFar: {
            $integral: { input: '$speed', unit: 'hour' },
            window: { range: ['unbounded', 'current'], unit: 'minute' },
          },
        },
      },
    },
    { $sort: { timestamp: -1 } },
    { $limit: 1 },
    {
      $project: {
        _id: 0,
        kmFromSpeed: round('$kmSoFar'),
        kmFromOdometer: {
          $round: [{ $subtract: ['$odometer', 20100] }, 1],
        },
      },
    },
  ]),
);
// km/h integrated over hours = km. They agree here only because the seed
// builds the odometer from these same speeds. With real devices, one speed
// sample per minute is an approximation (the trapezoid rule between samples),
// so expect a small difference. Devices without an odometer can still report
// distance this way.

section('3. F2: refuel events with $shift');
const withPrevFuel = [
  { $match: { organizationId: org } },
  {
    $setWindowFields: {
      ...perVehicle,
      output: {
        prevFuel: { $shift: { output: '$fuelLevel', by: -1 } },
      },
    },
  },
  { $set: { change: { $subtract: ['$fuelLevel', '$prevFuel'] } } },
];
show(
  db.readings.aggregate([
    ...withPrevFuel,
    { $match: { change: { $gt: 10 } } },
    {
      $project: {
        _id: 0,
        vehicleId: 1,
        at: {
          $dateToString: {
            date: '$timestamp',
            format: '%m-%d %H:%M',
            timezone: TZ,
          },
        },
        from: '$prevFuel',
        to: '$fuelLevel',
      },
    },
    { $sort: { vehicleId: 1, at: 1 } },
  ]),
);
// $shift by -1 copies the previous reading's fuel level into this one (null
// for the first reading of each vehicle). A jump of more than 10 points is a
// refuel; real sensors are noisy, so the threshold needs tuning.

section('4. F2: fuel used per day — the naive way and the right way');
show(
  db.readings.aggregate([
    ...withPrevFuel,
    { $match: { vehicleId: 'v-101' } },
    {
      $group: {
        _id: cairoDay,
        maxFuel: { $max: '$fuelLevel' },
        minFuel: { $min: '$fuelLevel' },
        used: {
          // Add up only the drops; ignore refuels (rises) and the first reading.
          $sum: {
            $cond: [{ $lt: ['$change', 0] }, { $multiply: ['$change', -1] }, 0],
          },
        },
        refuels: { $sum: { $cond: [{ $gt: ['$change', 10] }, 1, 0] } },
      },
    },
    {
      $project: {
        naive: round({ $subtract: ['$maxFuel', '$minFuel'] }),
        used: round('$used'),
        refuels: 1,
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// On days with a refuel, max − min measures nothing useful: it compares the
// lowest level before the refuel with the highest after it. Summing the drops
// between consecutive readings is correct whatever happens in between.
// (Here $match on vehicleId runs AFTER the window stage: it cannot move before
// it, because it would change which readings are "previous". Put it in the
// first $match when you know the vehicle up front.)

section('5. F3: idle minutes per vehicle per day');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, engineOn: true, speed: 0 } },
    {
      $group: {
        _id: { vehicleId: '$vehicleId', day: cairoDay },
        idleMinutes: { $sum: 1 },
      },
    },
    { $sort: { '_id.vehicleId': 1, '_id.day': 1 } },
  ]),
  6,
);
// One reading per minute, so counting readings counts minutes. With irregular
// readings, sum the time to the next reading instead ($shift by +1).

section('6. F3: idle episodes (gaps and islands)');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, vehicleId: { $in: ['v-102', 'v-103'] } } },
    { $set: { idle: { $and: ['$engineOn', { $eq: ['$speed', 0] }] } } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          prevIdle: { $shift: { output: '$idle', by: -1, default: false } },
        },
      },
    },
    // 1 where an idle run starts, else 0.
    {
      $set: {
        starts: { $cond: [{ $and: ['$idle', { $not: '$prevIdle' }] }, 1, 0] },
      },
    },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          // Running count of starts so far = the number of the current run.
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
    { $match: { minutes: { $gte: 12 } } }, // alert threshold
    {
      $group: {
        _id: '$_id.vehicleId',
        longIdles: { $sum: 1 },
        idleMinutes: { $sum: '$minutes' },
        first: { $min: '$from' },
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// Every reading of an idle run carries the same `episode` number, so a $group
// on it turns each run into one document with its length. v-102 idles 15
// minutes every working hour and triggers the alert; v-103 stops for 8 and does
// not. (The first episode each morning is cut short by the 07:00 start.) Total idle time alone (section 5) cannot tell a few long stops from many
// short ones.

section('7. A moving average for a smoother chart');
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: org,
        vehicleId: 'v-101',
        timestamp: {
          $gte: ISODate('2026-10-05T05:15:00Z'),
          $lt: ISODate('2026-10-05T05:25:00Z'),
        },
      },
    },
    {
      $setWindowFields: {
        ...perVehicle,
        output: {
          avg5: { $avg: '$speed', window: { documents: [-4, 0] } },
        },
      },
    },
    { $project: { _id: 0, timestamp: 1, speed: 1, avg5: round('$avg5') } },
  ]),
);
// A window of the current and 4 previous readings. With `range` + `unit`
// instead of `documents`, the window is defined in time (the last 5 minutes),
// which is correct even when readings are missing.
// The window only sees documents that passed the $match: the first rows
// average fewer than 5 readings (05:15 averages only itself). Widen the $match
// by the window size, and drop the extra rows after the window stage.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Fuel efficiency: km per fuel-percentage-point for each org-north vehicle
//    over the three days (distance from the odometer, fuel used from the drops).
//    Which vehicle is least efficient, and why (look at idle time)?
// 2. Detect a "stop": the engine goes from on to off. List the times v-201
//    switched its engine off, in Cairo time.
// 3. The longest single idle episode of every org-south vehicle, with its
//    start time in Cairo time.
// ---------------------------------------------------------------------------
