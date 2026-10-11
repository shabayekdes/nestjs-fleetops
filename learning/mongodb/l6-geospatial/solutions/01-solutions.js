// Solutions — Exercise 01
load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
db.latestPosition.createIndex({ organizationId: 1, location: '2dsphere' });
db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});

section('1. The 2 vehicles nearest to the north depot, in km');
show(
  db.latestPosition.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: PLACES.depotNorth.center },
        key: 'location',
        query: { organizationId: 'org-north' },
        distanceField: 'km',
        distanceMultiplier: 0.001,
      },
    },
    { $limit: 2 },
    { $project: { _id: 0, vehicleId: 1, km: { $round: ['$km', 2] } } },
  ]),
);
// distanceMultiplier scales the distance (metres → km). $limit after
// $geoNear: the nearest N.

section('2. Within 1 km of Heliopolis: two ways');
const centre = PLACES.heliopolis.center;
print(
  '  $geoWithin + $centerSphere:',
  db.latestPosition.distinct('vehicleId', {
    organizationId: 'org-north',
    location: {
      $geoWithin: { $centerSphere: [centre, 1000 / EARTH_RADIUS_M] },
    },
  }),
);
print(
  '  $geoNear + maxDistance:    ',
  db.latestPosition
    .aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: centre },
          key: 'location',
          query: { organizationId: 'org-north' },
          distanceField: 'm',
          maxDistance: 1000,
        },
      },
    ])
    .toArray()
    .map((v) => v.vehicleId + ' (' + Math.round(v.m) + ' m)'),
);
// Same set. $geoWithin: a filter (counts, other sorts, no distance).
// $geoNear: nearest first, with distances, but only as the first stage.

section('3. Org-south vehicles near their depot, 09:00–09:30 Cairo');
show(
  db.readings.aggregate([
    {
      $match: {
        organizationId: 'org-south',
        timestamp: {
          $gte: ISODate('2026-10-05T06:00:00Z'),
          $lt: ISODate('2026-10-05T06:30:00Z'),
        },
        location: {
          $geoWithin: {
            $centerSphere: [PLACES.depotSouth.center, 300 / EARTH_RADIUS_M],
          },
        },
      },
    },
    { $group: { _id: '$vehicleId', minutes: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]),
);
// One reading per minute, so readings = minutes. Each vehicle parks at its
// own spot; a spot more than 300 m from the centre would not count, which is
// why depots are better drawn as polygons than circles (exercise 02).
