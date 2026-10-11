// Learning Stage 3 — Exercise 04: multikey and 2dsphere indexes
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/04-multikey-and-geo-index.js
//
// Concepts
// - Index an array field and MongoDB adds one index key PER ELEMENT: a vehicle
//   with tags ['refrigerated', '4x4'] appears twice. That is a multikey index.
//   It is created like any other; MongoDB marks it multikey on its own.
// - A compound index may contain at most one array field per document
//   ("parallel arrays" are rejected): the number of keys would be the product
//   of the array lengths.
// - A 2dsphere index indexes GeoJSON on a sphere (the Earth). Coordinates are
//   [longitude, latitude]. Once the index exists, documents with invalid
//   GeoJSON in that field are rejected.
// - This exercise only CREATES geo indexes and looks at what they cost. Geo
//   queries ($near, $geoWithin) are Learning Stage 6.

load('/learning/l3-indexing/lib/telemetry.js');

function tryWrite(label, fn) {
  try {
    fn();
    print('  ' + label + ': ok');
  } catch (e) {
    print(
      '  ' +
        label +
        ': rejected, code ' +
        e.code +
        ': ' +
        e.message.split(':')[0],
    );
  }
}

section('1. A multikey index on vehicle tags');
db.vehicles.drop();
const tagSets = [
  ['refrigerated'],
  ['4x4', 'heavy'],
  ['refrigerated', 'heavy', 'hazmat'],
  [],
];
const vehicles = [];
for (let k = 0; k < 2000; k++) {
  vehicles.push({
    organizationId: k % 3 ? 'org-north' : 'org-south',
    plate: 'P-' + k,
    tags: tagSets[k % tagSets.length],
  });
}
db.vehicles.insertMany(vehicles);
db.vehicles.createIndex({ organizationId: 1, tags: 1 });

const idx = winningPlan(
  db.vehicles
    .find({ organizationId: 'org-north', tags: 'refrigerated' })
    .explain(),
).inputStage;
print(
  '  isMultiKey:',
  idx.isMultiKey,
  '| multiKeyPaths:',
  JSON.stringify(idx.multiKeyPaths),
);
report(
  'refrigerated, org-north',
  measure(
    db.vehicles.find({ organizationId: 'org-north', tags: 'refrigerated' }),
  ),
);
report(
  'refrigerated AND heavy',
  measure(
    db.vehicles.find({
      organizationId: 'org-north',
      tags: { $all: ['refrigerated', 'heavy'] },
    }),
  ),
);
// $all uses the index for one tag and checks the other after FETCH.

section('2. One key per element: the index grows with the arrays');
const s = storage('vehicles');
print('  documents:', s.count);
print(
  '  index keys (sum of tag counts, empty array = 1 key):',
  db.vehicles
    .aggregate([
      {
        $group: {
          _id: null,
          keys: { $sum: { $max: [1, { $size: '$tags' }] } },
        },
      },
    ])
    .toArray()[0].keys,
);
print('  index sizes:', JSON.stringify(s.indexSizes));
// An array that grows without bound (L2's "all readings in the vehicle") would
// also make its index entry count grow without bound, and every $push would
// add index keys. Another reason to keep arrays small and bounded.

section('3. Parallel arrays are rejected');
db.vehicles.createIndex({ tags: 1, depots: 1 });
tryWrite('one array field', () =>
  db.vehicles.insertOne({
    organizationId: 'org-north',
    tags: ['a'],
    depots: 'Cairo',
  }),
);
tryWrite('two array fields', () =>
  db.vehicles.insertOne({
    organizationId: 'org-north',
    tags: ['a', 'b'],
    depots: ['Cairo', 'Giza'],
  }),
);
// The index was accepted; the WRITE fails later. Find out when designing the
// index, not when a customer's data first has both arrays.
db.vehicles.dropIndex({ tags: 1, depots: 1 });

section('4. A 2dsphere index on reading locations');
print('readings:', seedReadings());
const before = storage('readings').totalIndexSize;
db.readings.createIndex(
  { organizationId: 1, location: '2dsphere', timestamp: -1 },
  { name: 'org_location_time' },
);
const after = storage('readings');
print('  2dsphere index size:', kb(after.indexSizes.org_location_time));
print('  _id index size:     ', kb(after.indexSizes._id_));
// organizationId first, as always for tenant data. A compound 2dsphere index
// can mix normal fields with one geo field.
print('  total index growth: ', kb(after.totalIndexSize - before));
// The geo index is about twice the size of the _id index: each point is stored
// as cells of a grid on the sphere. Only add it to telemetry if "near" or
// "inside an area" queries are a real access pattern (L6 decides).

section('5. Invalid GeoJSON is rejected once the index exists');
const base = {
  organizationId: 'org-north',
  vehicleId: 'v-101',
  timestamp: new Date(),
};
tryWrite('valid point [lng, lat]', () =>
  db.readings.insertOne({
    ...base,
    location: { type: 'Point', coordinates: [31.23, 30.04] },
  }),
);
tryWrite('swapped: latitude 91 is out of range', () =>
  db.readings.insertOne({
    ...base,
    location: { type: 'Point', coordinates: [30.04, 91] },
  }),
);
tryWrite('a plain [x, y] pair, not GeoJSON', () =>
  db.readings.insertOne({ ...base, location: [31.23, 30.04] }),
);
tryWrite('no location at all', () => db.readings.insertOne({ ...base }));
// Swapped coordinates inside Egypt ([30.04, 31.23] instead of [31.23, 30.04])
// are both in range and ARE accepted: they just point to the wrong place. The
// index validates format, not meaning. A legacy [x, y] pair is accepted by a
// 2dsphere index (as a legacy point) — but only the GeoJSON form is portable.
// A missing location is fine: the document is simply not geo-indexed.

db.readings.dropIndexes();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. Drivers have licenseClasses (e.g. ['B', 'C', 'CE']). Index them so
//    "drivers in this organization who can drive class CE" is an IXSCAN. Is
//    the index multikey? How many keys does a driver with 3 classes add?
// 2. Insert one reading each with these locations and predict which are
//    rejected before running: [181, 30], [31.2, -90], { type: 'Point',
//    coordinates: [31.2] }, { type: 'Point', coordinates: ['31.2', '30.0'] }.
// 3. A geofence document stores a Polygon. What must be true about its first
//    and last coordinates? Try inserting one that breaks the rule into a
//    collection with a 2dsphere index.
// ---------------------------------------------------------------------------
