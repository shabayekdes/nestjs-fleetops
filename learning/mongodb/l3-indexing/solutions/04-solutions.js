// Solutions — Exercise 04
load('/learning/l3-indexing/lib/telemetry.js');

function tryWrite(label, fn) {
  try {
    fn();
    print('  ' + label + ': ok');
  } catch (e) {
    print('  ' + label + ': rejected (code ' + e.code + ')');
  }
}

section('1. Drivers by license class');
db.drivers.drop();
db.drivers.insertMany([
  {
    organizationId: 'org-north',
    name: 'Mona',
    licenseClasses: ['B', 'C', 'CE'],
  },
  { organizationId: 'org-north', name: 'Omar', licenseClasses: ['B'] },
  { organizationId: 'org-south', name: 'Hany', licenseClasses: ['B', 'CE'] },
]);
db.drivers.createIndex({ organizationId: 1, licenseClasses: 1 });
const q = () =>
  db.drivers.find({ organizationId: 'org-north', licenseClasses: 'CE' });
report('class CE in org-north', measure(q()));
print('  isMultiKey:', winningPlan(q().explain()).inputStage.isMultiKey);
// Yes, multikey. Mona adds 3 keys: one per class.

section('2. Which locations are rejected?');
db.geo_check.drop();
db.geo_check.createIndex({ location: '2dsphere' });
[
  ['[181, 30] (legacy pair)', [181, 30]],
  ['[31.2, -90] (legacy pair)', [31.2, -90]],
  ['Point with one coordinate', { type: 'Point', coordinates: [31.2] }],
  [
    'Point with string coordinates',
    { type: 'Point', coordinates: ['31.2', '30.0'] },
  ],
].forEach(([label, location]) =>
  tryWrite(label, () => db.geo_check.insertOne({ location })),
);
// Longitude must be within ±180 and latitude within ±90 (-90 is the South
// Pole, so it is valid). A Point needs exactly two numbers.

section('3. A polygon must be closed');
tryWrite('open polygon (first ≠ last)', () =>
  db.geo_check.insertOne({
    location: {
      type: 'Polygon',
      coordinates: [
        [
          [31.2, 30.0],
          [31.3, 30.0],
          [31.3, 30.1],
          [31.2, 30.1],
        ],
      ],
    },
  }),
);
tryWrite('closed polygon (first = last)', () =>
  db.geo_check.insertOne({
    location: {
      type: 'Polygon',
      coordinates: [
        [
          [31.2, 30.0],
          [31.3, 30.0],
          [31.3, 30.1],
          [31.2, 30.1],
          [31.2, 30.0],
        ],
      ],
    },
  }),
);
// A GeoJSON ring repeats its first point at the end. Geofences are L6.
db.geo_check.drop();
