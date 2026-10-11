// Solutions — Exercise 02
load('/learning/l6-geospatial/lib/geo.js');
print('readings:', seed());
db.readings.createIndex({
  organizationId: 1,
  location: '2dsphere',
  timestamp: -1,
});
db.geofences.createIndex({ organizationId: 1, area: '2dsphere' });

section('1. Org-south minutes in Downtown and in the depot');
for (const f of db.geofences.find({ organizationId: 'org-south' }).toArray()) {
  const rows = db.readings
    .aggregate([
      {
        $match: {
          organizationId: 'org-south',
          location: { $geoWithin: { $geometry: f.area } },
        },
      },
      { $group: { _id: '$vehicleId', minutes: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  print(
    '  ' + f.name.padEnd(12),
    rows.map((r) => r._id + ': ' + r.minutes).join(' | '),
  );
}
// org-south's own Downtown fence (gf-downtown-s), not org-north's, even though
// both cover the same streets.

section('2. A no-idling zone with a loading bay hole');
const [x, y] = PLACES.downtown.center;
const d = 0.0009; // ~100 m each way → a ~200 m square
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const bay = [
  [x - d, y - d],
  [x + d, y - d],
  [x + d, y + d],
  [x - d, y + d],
  [x - d, y - d],
].map(([a, b]) => [r6(a), r6(b)]);
const downtown = db.geofences.findOne({ _id: 'gf-downtown-n' });
db.geofences.deleteOne({ _id: 'gf-no-idle-downtown' });
db.geofences.insertOne({
  _id: 'gf-no-idle-downtown',
  organizationId: 'org-north',
  name: 'Downtown no idling (except loading bay)',
  kind: 'rule',
  area: { type: 'Polygon', coordinates: [downtown.area.coordinates[0], bay] },
});
const zone = db.geofences.findOne({ _id: 'gf-no-idle-downtown' }).area;
print(
  '  idling readings in the zone:',
  db.readings.countDocuments({
    organizationId: 'org-north',
    engineOn: true,
    speed: 0,
    location: { $geoWithin: { $geometry: zone } },
  }),
);
// 0: in this data vehicles switch the engine off when they stop. The query is
// the point: rules are geofences plus conditions on the reading.

section('3. A 32-sided "circle" found with $geoIntersects');
const centre = [31.245, 30.045];
const radius = 400;
const ring = Array.from({ length: 32 }, (_, i) => {
  const a = (2 * Math.PI * i) / 32;
  const dLat = ((radius * Math.cos(a)) / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng =
    ((radius * Math.sin(a)) /
      (EARTH_RADIUS_M * Math.cos((centre[1] * Math.PI) / 180))) *
    (180 / Math.PI);
  return [r6(centre[0] + dLng), r6(centre[1] + dLat)];
});
ring.push(ring[0]); // close the ring
db.geofences.deleteOne({ _id: 'gf-customer-400m' });
db.geofences.insertOne({
  _id: 'gf-customer-400m',
  organizationId: 'org-north',
  name: 'Customer (400 m)',
  kind: 'customer',
  area: { type: 'Polygon', coordinates: [ring] },
});
const v103 = db.latestPosition.findOne({ vehicleId: 'v-103' });
print(
  '  fences containing v-103:',
  db.geofences
    .find({
      organizationId: 'org-north',
      area: { $geoIntersects: { $geometry: v103.location } },
    })
    .toArray()
    .map((g) => g.name),
);
// A degree of longitude is shorter than a degree of latitude (exercise 01), so
// the longitude offset is divided by cos(latitude). 32 sides: the polygon is
// within ~2 m of the true circle at this size.
