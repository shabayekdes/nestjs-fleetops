// Solutions — Exercise 04
load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
const org = 'org-north';
const perVehicle = { partitionBy: '$vehicleId', sortBy: { timestamp: 1 } };

section('1. GPS distance while moving / odometer distance');
const gps = {};
for (const v of db.readings.distinct('vehicleId', { organizationId: org })) {
  const rows = db.readings
    .find({ organizationId: org, vehicleId: v })
    .sort({ timestamp: 1 })
    .toArray();
  let moving = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].engineOn) {
      moving += haversine(
        rows[i - 1].location.coordinates,
        rows[i].location.coordinates,
      );
    }
  }
  const odo = rows[rows.length - 1].odometer - rows[0].odometer;
  gps[v] = (moving / 1000 / odo).toFixed(2);
}
print('  ratio per vehicle:', JSON.stringify(gps));
// About 0.8 for every vehicle: the seed makes roads exactly 20% longer than
// straight segments everywhere. Real ratios vary with the street layout, the
// fix interval, GPS quality and tunnels or parking garages with no signal.
// (Computed in mongosh here to show the same haversine as exercise 04 in plain
// JavaScript; the aggregation version stays in the database.)

section('2. Trips that include their arrival point');
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
  // Engine on, OR the first reading after the engine went off (the arrival).
  // That reading still has the trip number of the trip it ends.
  { $match: { $or: [{ engineOn: true }, { wasOn: true }] } },
  { $sort: { timestamp: 1 } },
  {
    $group: {
      _id: { vehicleId: '$vehicleId', trip: '$trip' },
      organizationId: { $first: '$organizationId' },
      points: { $push: '$location.coordinates' },
    },
  },
  {
    $project: {
      _id: 0,
      organizationId: 1,
      vehicleId: '$_id.vehicleId',
      route: { type: 'LineString', coordinates: '$points' },
    },
  },
  { $out: 'trips' },
]); // prettier-ignore
db.trips.createIndex({ organizationId: 1, route: '2dsphere' });
const heliopolis = db.geofences.findOne({ _id: 'gf-heliopolis-n' }).area;
show(
  db.trips.aggregate([
    { $match: { organizationId: org, route: { $geoIntersects: { $geometry: heliopolis } } } },
    { $group: { _id: '$vehicleId', trips: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]),
); // prettier-ignore
// Now every trip to and from Heliopolis matches. The arrival reading is the
// most important point of a trip ("where did it go?"), and the engine-on rule
// left it out.

section('3. A coarse heat map (0.01° cells)');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, engineOn: true } },
    {
      $group: {
        _id: {
          $map: {
            input: '$location.coordinates',
            as: 'c',
            in: { $divide: [{ $floor: { $multiply: ['$$c', 100] } }, 100] },
          },
        },
        readings: { $sum: 1 },
      },
    },
    { $sort: { readings: -1 } },
    { $limit: 3 },
    { $project: { _id: 0, cellSouthWest: '$_id', readings: 1 } },
  ]),
);
// $floor(x × 100) / 100 snaps each coordinate to the cell's south-west corner.
// A heat map from rounded cells is also a privacy measure: it shows where the
// fleet drives, not where one driver stopped.
