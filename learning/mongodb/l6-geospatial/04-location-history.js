// Learning Stage 6 — Exercise 04: location history, trips and routes
//
// Run: docker compose exec mongo mongosh --quiet learning_l6 /learning/l6-geospatial/04-location-history.js
//
// Concepts
// - A vehicle's location history is its readings in time order. A trip is a
//   run of readings with the engine on (gaps and islands, L5).
// - A route can be stored as a GeoJSON LineString. With a 2dsphere index on
//   it, "which trips passed through this area?" is one query.
// - Distance from GPS points (haversine between consecutive fixes) is NOT the
//   odometer: straight segments cut corners, and a parked vehicle's jitter
//   adds distance it never drove.
// - A map does not need every point. Thin the history before sending it.
// - Location history is personal data about drivers: keep less of it, less
//   precisely, for less time, and only for the organization that owns it.
//
// Access patterns:
//   H1  trips of a vehicle: start, end, distance, route
//   H2  trips that passed through an area
//   H3  a vehicle's path for a map, at a sensible number of points

load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
const org = 'org-north';
const TZ = 'Africa/Cairo';
const perVehicle = { partitionBy: '$vehicleId', sortBy: { timestamp: 1 } };

// Haversine distance in metres between two [lng, lat] expressions, as an
// aggregation expression (there is no built-in "distance between two fields").
function haversineExpr(a, b) {
  const lng1 = { $degreesToRadians: { $arrayElemAt: [a, 0] } };
  const lat1 = { $degreesToRadians: { $arrayElemAt: [a, 1] } };
  const lng2 = { $degreesToRadians: { $arrayElemAt: [b, 0] } };
  const lat2 = { $degreesToRadians: { $arrayElemAt: [b, 1] } };
  const sinHalf = (x, y) => ({ $pow: [{ $sin: { $divide: [{ $subtract: [x, y] }, 2] } }, 2] });
  return {
    $multiply: [
      2 * EARTH_RADIUS_M,
      {
        $asin: {
          $sqrt: {
            $add: [
              sinHalf(lat2, lat1),
              { $multiply: [{ $cos: lat1 }, { $cos: lat2 }, sinHalf(lng2, lng1)] },
            ],
          },
        },
      },
    ],
  };
} // prettier-ignore

section('1. Distance: GPS points vs odometer');
show(
  db.readings.aggregate([
    { $match: { organizationId: org } },
    {
      $setWindowFields: {
        ...perVehicle,
        output: { prev: { $shift: { output: '$location.coordinates', by: -1 } } },
      },
    },
    { $match: { prev: { $ne: null } } },
    { $set: { step: haversineExpr('$prev', '$location.coordinates') } },
    {
      $group: {
        _id: '$vehicleId',
        gpsAllKm: { $sum: { $divide: ['$step', 1000] } },
        gpsMovingKm: { $sum: { $cond: ['$engineOn', { $divide: ['$step', 1000] }, 0] } },
        firstOdo: { $min: '$odometer' },
        lastOdo: { $max: '$odometer' },
      },
    },
    {
      $project: {
        gpsAllKm: { $round: ['$gpsAllKm', 1] },
        gpsMovingKm: { $round: ['$gpsMovingKm', 1] },
        odometerKm: { $round: [{ $subtract: ['$lastOdo', '$firstOdo'] }, 1] },
      },
    },
    { $sort: { _id: 1 } },
  ]),
); // prettier-ignore
// - gpsAllKm includes the jitter of every parked minute: distance never driven.
// - gpsMovingKm ignores parked fixes, but measures straight lines between
//   one-minute fixes, so it is below the odometer (streets are ~20% longer
//   here). More frequent fixes get closer.
// Prefer the odometer when the device has one (L5); GPS distance needs
// filtering (moving only, minimum step) and is an estimate.

section('2. H1: trips with gaps and islands, stored with their route');
db.trips.drop();
db.readings.aggregate([
  { $match: { organizationId: org } },
  {
    $setWindowFields: {
      ...perVehicle,
      output: { wasOn: { $shift: { output: '$engineOn', by: -1, default: false } } },
    },
  },
  { $set: { starts: { $cond: [{ $and: ['$engineOn', { $not: '$wasOn' }] }, 1, 0] } } },
  {
    $setWindowFields: {
      ...perVehicle,
      output: { trip: { $sum: '$starts', window: { documents: ['unbounded', 'current'] } } },
    },
  },
  { $match: { engineOn: true } },
  { $sort: { timestamp: 1 } },
  {
    $group: {
      _id: { vehicleId: '$vehicleId', trip: '$trip' },
      organizationId: { $first: '$organizationId' },
      startedAt: { $first: '$timestamp' },
      endedAt: { $last: '$timestamp' },
      startOdo: { $first: '$odometer' },
      endOdo: { $last: '$odometer' },
      points: { $push: '$location.coordinates' },
    },
  },
  {
    $project: {
      _id: 0,
      organizationId: 1,
      vehicleId: '$_id.vehicleId',
      startedAt: 1,
      endedAt: 1,
      km: { $round: [{ $subtract: ['$endOdo', '$startOdo'] }, 2] },
      route: { type: 'LineString', coordinates: '$points' },
    },
  },
  { $out: 'trips' },
]); // prettier-ignore
db.trips.createIndex({ organizationId: 1, route: '2dsphere' });
print('  trips:', db.trips.countDocuments());
show(
  db.trips
    .find(
      { vehicleId: 'v-102' },
      { _id: 0, vehicleId: 1, startedAt: 1, endedAt: 1, km: 1 },
    )
    .sort({ startedAt: 1 }),
  4,
);
// Each trip is one small document with its route: the trip list of a vehicle
// page no longer touches the raw readings. A trip still in progress at the end
// of the data is cut off; a nightly job would recompute recent trips.

section('3. H2: which trips passed through Heliopolis?');
const heliopolis = db.geofences.findOne({ _id: 'gf-heliopolis-n' }).area;
show(
  db.trips
    .aggregate([
      { $match: { organizationId: org, route: { $geoIntersects: { $geometry: heliopolis } } } },
      { $group: { _id: '$vehicleId', trips: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
); // prettier-ignore
// Only 3 of each vehicle's 6 trips match: the return trips, which start
// inside the zone. An outbound trip ends at its last engine-on fix, about 1 km
// short of the zone: the arrival point is the first engine-OFF reading, and
// the trip left it out. Trip boundaries are a modeling decision: include the
// stop reading as the trip's last point (solutions/04, task 2).
// $geoIntersects on LineStrings: a trip matches if any part of its route
// crosses the polygon, even between two fixes. Readings ($geoWithin on points)
// would miss a trip that crossed a corner of the area between two fixes.

section('4. H3: thinning a path for the map');
const path = { organizationId: org, vehicleId: 'v-104' };
print('  all points:', db.readings.countDocuments(path));
const thinned = db.readings
  .aggregate([
    { $match: path },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        // One point per 5 minutes while parked, every point while driving.
        _id: {
          $cond: [
            '$engineOn',
            '$timestamp',
            { $dateTrunc: { date: '$timestamp', unit: 'minute', binSize: 5 } },
          ],
        },
        at: { $first: '$timestamp' },
        point: { $first: '$location.coordinates' },
      },
    },
    { $sort: { at: 1 } },
  ])
  .toArray();
print('  thinned:   ', thinned.length, '(parked: one per 5 min; driving: all)');
// Parked minutes carry no new information except "still here". Shape-based
// simplification (e.g. Douglas–Peucker) is usually done in application code.

section('5. Less precise, for less time');
show(
  db.readings.aggregate([
    { $match: { ...path, engineOn: true } },
    { $limit: 2 },
    {
      $project: {
        _id: 0,
        exact: '$location.coordinates',
        approx: {
          $map: {
            input: '$location.coordinates',
            as: 'c',
            in: { $round: ['$$c', 3] },
          },
        },
      },
    },
  ]),
);
// 6 decimals ≈ 0.1 m (more than GPS can give); 3 decimals ≈ 100 m: enough for
// "which district" analytics and heat maps, not enough to find a house.
// Practical rules for FleetOps location data:
// - raw readings expire (L3: TTL / expireAfterSeconds), trips and summaries
//   are kept, possibly with rounded coordinates;
// - every query is scoped by organizationId (exercise 01: a geo query without
//   it leaks other tenants' vehicles);
// - location is shown only to roles that need it, and only for working hours
//   if the organization's policy says so (decided when a GPS product exists);
// - this track uses synthetic data only.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. For each org-north vehicle: GPS distance while moving divided by odometer
//    distance. Why is it almost the same ratio for every vehicle here, and why
//    would it not be with real data?
// 2. Rebuild `trips` so each trip also includes the first engine-off reading
//    after it (the arrival). How many trips now pass through Heliopolis?
// 3. A coarse heat map: count org-north readings while driving per grid cell of
//    0.01° × 0.01° (about 1 km). Which cell is the busiest?
// ---------------------------------------------------------------------------
