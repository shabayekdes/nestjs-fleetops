// Learning Stage 6 — Exercise 01: GeoJSON and nearest vehicles
//
// Run: docker compose exec mongo mongosh --quiet learning_l6 /learning/l6-geospatial/01-geojson-and-near.js
//
// Concepts
// - GeoJSON point: { type: 'Point', coordinates: [longitude, latitude] }.
//   Longitude first (x, east–west), the reverse of how people say it.
// - Degrees are not metres. One degree of latitude is ~111 km everywhere; one
//   degree of longitude shrinks towards the poles (~96 km at Cairo).
// - A 2dsphere index computes on a sphere, and distances are in METRES.
// - $near (find) and $geoNear (aggregation) return documents nearest first.
//   Both need a geo index. $geoNear can also return the distance itself.
// - Tenant data: organizationId is the first field of the geo index and part
//   of every geo query, as for any other query.
//
// Access patterns:
//   G1  the nearest vehicles of an organization to a point (an incident, a
//       customer call), with distances, within a maximum distance
//   G2  which vehicles were near a point during a time window (history)

load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
const org = 'org-north';
const incident = { type: 'Point', coordinates: [31.25, 30.05] }; // near Downtown

section('1. Degrees are not metres');
const c = PLACES.depotNorth.center;
print(
  '  0.001° of latitude: ',
  Math.round(haversine(c, [c[0], c[1] + 0.001])),
  'm',
);
print(
  '  0.001° of longitude:',
  Math.round(haversine(c, [c[0] + 0.001, c[1]])),
  'm',
);
print(
  '  north depot → Downtown, straight line:',
  km(haversine(PLACES.depotNorth.center, PLACES.downtown.center)),
  'km',
);
print(
  '  …with lng/lat swapped by mistake:     ',
  km(
    haversine(
      [c[1], c[0]],
      [PLACES.downtown.center[1], PLACES.downtown.center[0]],
    ),
  ),
  'km',
);
// A swapped pair is still a valid point (L3), just somewhere else: here the
// "distance" is even plausible. Test with a known distance when you write
// geo code.

section('2. $near needs a geo index');
try {
  db.latestPosition
    .find({ location: { $near: { $geometry: incident } } })
    .toArray();
} catch (e) {
  print('  without index:', e.message.match(/unable to find index[^\n]*/)[0]);
}
db.latestPosition.createIndex({ organizationId: 1, location: '2dsphere' });
print('  index created: { organizationId: 1, location: "2dsphere" }');

section('3. G1 with $near: nearest first, within 5 km');
show(
  db.latestPosition.find(
    {
      organizationId: org,
      location: {
        $near: { $geometry: incident, $maxDistance: 5000 },
      },
    },
    { _id: 0, vehicleId: 1, 'location.coordinates': 1 },
  ),
);
// Sorted by distance without any sort(). $maxDistance is in metres. But the
// distance itself is not returned: for "1.2 km away" use $geoNear.

section('4. G1 with $geoNear: distances included');
show(
  db.latestPosition.aggregate([
    {
      $geoNear: {
        near: incident,
        key: 'location',
        query: { organizationId: org },
        distanceField: 'metres',
        maxDistance: 5000,
        spherical: true,
      },
    },
    { $project: { _id: 0, vehicleId: 1, metres: { $round: ['$metres', 0] } } },
  ]),
);
// $geoNear must be the FIRST stage, so other filters go into its `query`
// (here the tenant). `key` names the indexed field. Everything after it is a
// normal pipeline: $limit for "nearest 3", $lookup for the driver, etc.

section('5. Forgetting the tenant');
const nearAll = () =>
  db.latestPosition
    .aggregate([
      {
        $geoNear: {
          near: incident,
          key: 'location',
          distanceField: 'metres',
          maxDistance: 5000,
        },
      },
      { $project: { _id: 0, organizationId: 1, vehicleId: 1 } },
    ])
    .toArray()
    .map((v) => v.organizationId + '/' + v.vehicleId)
    .join(', ');
try {
  nearAll();
} catch (e) {
  print(
    '  tenant-first index, no organizationId:',
    e.message.match(/unable to find index[^\n]*/)[0],
  );
}
// With { organizationId: 1, location: '2dsphere' } the query without a tenant
// does not run at all. That is a useful safety net. Now the same query with a
// plain geo index, as many tutorials create it:
db.latestPosition.dropIndex({ organizationId: 1, location: '2dsphere' });
db.latestPosition.createIndex({ location: '2dsphere' });
print('  plain geo index, no organizationId:   ', nearAll());
db.latestPosition.dropIndex({ location: '2dsphere' });
db.latestPosition.createIndex({ organizationId: 1, location: '2dsphere' });
// org-south's vehicles are Downtown too: real places are shared, so a geo
// query without the tenant leaks other customers' vehicles. Put organizationId
// first in every geo index, and take it from the JWT, never from the request.

section('6. What $near cannot do');
try {
  db.latestPosition.countDocuments({
    organizationId: org,
    location: { $near: { $geometry: incident, $maxDistance: 5000 } },
  });
} catch (e) {
  print('  countDocuments with $near:', e.message.split('.')[0]);
}
print(
  '  count with $geoWithin + $centerSphere:',
  db.latestPosition.countDocuments({
    organizationId: org,
    location: {
      $geoWithin: {
        $centerSphere: [incident.coordinates, 5000 / EARTH_RADIUS_M],
      },
    },
  }),
);
// $near sorts by distance, and counting cannot use a sorted search. To count
// (or to filter without caring about order) use $geoWithin with a circle:
// $centerSphere takes [centre, radius in RADIANS] = metres / Earth radius.

section('7. G2: who was near the incident between 10:00 and 10:30 Cairo?');
db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});
const window = {
  $gte: ISODate('2026-10-05T07:00:00Z'),
  $lt: ISODate('2026-10-05T07:30:00Z'),
};
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: org,
        timestamp: window,
        location: {
          $geoWithin: {
            $centerSphere: [incident.coordinates, 1000 / EARTH_RADIUS_M],
          },
        },
      },
    },
    {
      $group: {
        _id: '$vehicleId',
        firstSeen: { $min: '$timestamp' },
        lastSeen: { $max: '$timestamp' },
        readings: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// On the history, "nearest" makes little sense ($near would return the same
// vehicle's readings over and over). Ask "within R metres, during T" instead,
// then group by vehicle. The compound index bounds tenant, area and time.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. The 2 org-north vehicles nearest to the north depot's centre right now,
//    with distances in km (hint: $geoNear's distanceMultiplier).
// 2. Org-north vehicles within 1 km of the Heliopolis zone centre right now:
//    once with $geoWithin + $centerSphere, once with $geoNear + maxDistance.
//    When would you choose each?
// 3. Which org-south vehicles were within 300 m of their own depot centre
//    between 09:00 and 09:30 Cairo, and for how many minutes each?
// ---------------------------------------------------------------------------
