// Learning Stage 6 — Exercise 02: $geoWithin, $geoIntersects and geofences
//
// Run: docker compose exec mongo mongosh --quiet learning_l6 /learning/l6-geospatial/02-geowithin-geofences.js
//
// Concepts
// - A geofence is an area: a GeoJSON Polygon. Its outer ring is closed (the
//   first point repeated at the end); further rings are holes.
// - Two directions:
//     points inside an area:     readings.find({ location: { $geoWithin: area } })
//     areas containing a point:  geofences.find({ area: { $geoIntersects: point } })
//   Both can use a 2dsphere index: on the points, or on the areas.
// - GeoJSON has no circle. Store a circular fence as centre + radius and query
//   it with $centerSphere (radius in radians), or approximate it by a polygon.
// - Geofences are tenant data like any other: each organization owns its own,
//   even when two of them draw the same place.
//
// Access patterns:
//   Z1  which vehicles are inside a geofence now
//   Z2  how long each vehicle spent inside each of its organization's fences
//   Z3  which fences contain a vehicle's current position

load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
const org = 'org-north';
db.latestPosition.createIndex({ organizationId: 1, location: '2dsphere' });
db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});
const fence = (id) => db.geofences.findOne({ _id: id });

section('1. Z1: who is in the Downtown customer zone now?');
const downtown = fence('gf-downtown-n');
print(
  '  fence:',
  downtown.name,
  JSON.stringify(downtown.area.coordinates[0].slice(0, 2)),
  '…',
);
show(
  db.latestPosition.find(
    {
      organizationId: org,
      location: { $geoWithin: { $geometry: downtown.area } },
    },
    { _id: 0, vehicleId: 1, timestamp: 1 },
  ),
);
// The fence's geometry is read from the database first, then used as a query
// value: two round trips. Geo operators take literal geometries, not field
// references, so you cannot "join" readings to fences inside one query.

section('2. Z2: minutes inside each fence, per vehicle');
const fences = db.geofences.find({ organizationId: org }).toArray();
for (const f of fences) {
  const rows = db.readings
    .aggregate([
      {
        $match: {
          organizationId: org,
          location: { $geoWithin: { $geometry: f.area } },
        },
      },
      { $group: { _id: '$vehicleId', minutes: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  print(
    '  ' + f.name.padEnd(22),
    rows.map((r) => r._id + ': ' + r.minutes).join(' | ') || '(nobody)',
  );
}
// One query per fence: the loop lives in the application. With many fences,
// the other direction (section 3) scales better: per reading, ask which fences
// contain it.

section('3. Z3: which fences contain a point? $geoIntersects');
db.geofences.createIndex({ organizationId: 1, area: '2dsphere' });
for (const p of db.latestPosition
  .find({ organizationId: org })
  .sort({ vehicleId: 1 })) {
  const names = db.geofences
    .find(
      {
        organizationId: org,
        area: { $geoIntersects: { $geometry: p.location } },
      },
      { name: 1 },
    )
    .toArray()
    .map((g) => g.name);
  print('  ' + p.vehicleId, '→', names.join(', ') || '(no fence: on the road)');
}
// The index is on the AREAS this time. This is the shape geofence alerts need:
// one small query per incoming reading (exercise 03).

section('4. Polygons with a hole');
// The depot has a workshop in its south-east corner. Vehicles in the workshop
// are "in maintenance", not "available at the depot".
const depot = fence('gf-depot-north');
const [x, y] = PLACES.depotNorth.center;
const workshop = [
  [x + 0.0004, y - 0.0036],
  [x + 0.0036, y - 0.0036],
  [x + 0.0036, y - 0.0004],
  [x + 0.0004, y - 0.0004],
  [x + 0.0004, y - 0.0036],
].map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6]);
const depotWithoutWorkshop = {
  type: 'Polygon',
  coordinates: [depot.area.coordinates[0], workshop], // outer ring, then hole
};
const insideAt = (area) =>
  db.readings.distinct('vehicleId', {
    organizationId: org,
    timestamp: ISODate('2026-10-05T06:00:00Z'), // 09:00 Cairo
    location: { $geoWithin: { $geometry: area } },
  });
print('  in the depot at 09:00:               ', insideAt(depot.area));
print(
  '  in the depot, excluding the workshop:',
  insideAt(depotWithoutWorkshop),
);
// v-103 and v-104 park inside the hole. The hole must lie strictly inside the
// outer ring: a hole that shares an edge with it is rejected ("secondary loops
// not contained by first exterior loop").

section('5. Invalid polygons are rejected');
db.fence_check.drop();
db.fence_check.createIndex({ area: '2dsphere' });
function tryFence(label, coordinates) {
  try {
    db.fence_check.insertOne({ area: { type: 'Polygon', coordinates } });
    print('  ' + label + ': accepted');
  } catch (e) {
    print('  ' + label + ': rejected (' + e.code + ')');
  }
}
tryFence('square', [
  [
    [31.2, 30.0],
    [31.3, 30.0],
    [31.3, 30.1],
    [31.2, 30.1],
    [31.2, 30.0],
  ],
]);
tryFence('bow-tie (edges cross)', [
  [
    [31.2, 30.0],
    [31.3, 30.1],
    [31.3, 30.0],
    [31.2, 30.1],
    [31.2, 30.0],
  ],
]);
tryFence('ring not closed', [
  [
    [31.2, 30.0],
    [31.3, 30.0],
    [31.3, 30.1],
    [31.2, 30.1],
  ],
]);
tryFence('only 3 points', [
  [
    [31.2, 30.0],
    [31.3, 30.0],
    [31.2, 30.0],
  ],
]);
// prettier-ignore
// Geofences are drawn by users on a map. Validate them when they are saved
// (the index does it for you), and show the error in the UI, not later when
// a reading is checked against them.

section('6. Circular fences');
const customer = { center: [31.245, 30.045], radiusM: 400 };
print(
  '  readings within 400 m of a customer, 10:00–11:00 Cairo:',
  db.readings.countDocuments({
    organizationId: org,
    timestamp: {
      $gte: ISODate('2026-10-05T07:00:00Z'),
      $lt: ISODate('2026-10-05T08:00:00Z'),
    },
    location: {
      $geoWithin: {
        $centerSphere: [customer.center, customer.radiusM / EARTH_RADIUS_M],
      },
    },
  }),
);
// Stored as { center, radiusM }: easy to edit, exact. It cannot be found with
// $geoIntersects (section 3), because it is not a geometry; if fences must be
// looked up by point, store the circle as a polygon with enough vertices.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. How many minutes did each org-south vehicle spend in org-south's Downtown
//    fence, and how many in its depot?
// 2. Org-north wants a "no idling" zone: Downtown without a 200 m × 200 m
//    square around its centre (a loading bay). Save it as a geofence with a
//    hole, then count org-north readings with the engine on and speed 0
//    inside it.
// 3. Build a 32-sided polygon approximating a 400 m circle around
//    [31.245, 30.045], save it in `geofences`, and find it with $geoIntersects
//    from v-103's latest position.
// ---------------------------------------------------------------------------
