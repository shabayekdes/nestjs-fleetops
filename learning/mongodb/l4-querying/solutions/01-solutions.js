// Solutions — Exercise 01
load('/learning/l4-querying/lib/telemetry.js');
print('readings:', seedReadings());
const north = { organizationId: 'org-north' };
const window = {
  $gte: ISODate('2026-10-05T07:00:00Z'),
  $lt: ISODate('2026-10-05T07:30:00Z'),
};

section('1. Idling vs impossible readings');
const idling = { speed: 0, 'engine.on': true };
const impossible = { speed: { $gt: 0 }, 'engine.on': false };
print(
  '  either:',
  db.readings.countDocuments({
    ...north,
    timestamp: window,
    $or: [idling, impossible],
  }),
);
print(
  '  idling:',
  db.readings.countDocuments({ ...north, timestamp: window, ...idling }),
);
print(
  '  engine off but moving:',
  db.readings.countDocuments({ ...north, timestamp: window, ...impossible }),
);
// Empty because the seed sets speed to 0 when the engine is off. Nothing in
// the database guarantees it: a real device could send such a reading.
// Schema validation (L7) can check single fields; a cross-field rule like this
// needs $expr in the validator or a check in the application.

section('2. Numeric fuel below 60, excluding two vehicles');
const q = () =>
  db.readings.find({
    ...north,
    vehicleId: { $nin: ['v-101', 'v-102'] },
    fuelLevel: { $type: 'number', $lt: 60 },
  });
print('  count:', q().count());
print('  ', cost(q()));
// { $lt: 60 } alone already skips strings (type brackets) and null/missing,
// so $type: 'number' only makes the intent explicit.
// The index narrows organizationId and vehicleId (the $nin ranges); fuelLevel
// is not in it, so 1 080 documents are fetched to keep 146. If this report ran
// often, an index with fuelLevel after vehicleId would fix it.

section('3. Bad fuel values by kind');
[
  ['missing', { fuelLevel: { $exists: false } }],
  ['null', { fuelLevel: { $type: 'null' } }],
  ['string', { fuelLevel: { $type: 'string' } }],
].forEach(([kind, f]) =>
  print(
    '  ' + kind.padEnd(8),
    db.readings.distinct('vehicleId', { ...north, ...f }),
  ),
);
print(
  '  the report skips:',
  db.readings.countDocuments({
    ...north,
    fuelLevel: { $not: { $type: 'number' } },
  }),
  "readings ({ fuelLevel: { $not: { $type: 'number' } } })",
);
