// Learning Stage 4 — Exercise 01: query operators on telemetry
//
// Run: docker compose exec mongo mongosh --quiet learning_l4 /learning/l4-querying/01-operators.js
//
// Concepts
// - Comparison: $eq $ne $gt $gte $lt $lte $in $nin. Logical: $and $or $nor
//   $not. Fields listed side by side in one filter are an implicit AND.
// - Missing, null and wrong types are three different things. Device data
//   has all three, and each operator treats them differently.
// - Comparisons only match values of the same type "bracket": { $gt: 50 }
//   never matches the string "85".
// - Operators differ in how well they use an index. Equality, ranges and $in
//   narrow the index; $ne, $nin and "not" conditions mostly cannot.
//
// Access patterns:
//   Q1  speeding: one organization, a time window, speed above a limit
//   Q2  data quality: readings with no usable fuel level
//   Q3  a subset of vehicles (a depot, a driver's vehicles)

load('/learning/l4-querying/lib/telemetry.js');
print('readings:', seedReadings());

section('1. Q1: speeding in a time window');
const window = {
  $gte: ISODate('2026-10-05T08:00:00Z'),
  $lt: ISODate('2026-10-05T09:00:00Z'),
};
const speeding = db.readings
  .find(
    { organizationId: 'org-north', timestamp: window, speed: { $gt: 120 } },
    { _id: 0, vehicleId: 1, timestamp: 1, speed: 1 },
  )
  .sort({ timestamp: 1 })
  .toArray();
print('  readings above 120 km/h, 08:00–09:00:', speeding.length);
speeding.slice(0, 3).forEach((r) => print('   ', JSON.stringify(r)));
// Three conditions on three fields: an implicit AND. Two conditions on the
// SAME field go in one object: { speed: { $gt: 100, $lte: 120 } }.

section('2. The duplicate-key trap in a JavaScript filter');
const wrong = { organizationId: 'org-north', speed: { $gt: 100 }, speed: { $lt: 5 } }; // prettier-ignore
print('  filter actually sent:', JSON.stringify(wrong));
print('  matches:', db.readings.countDocuments(wrong));
// A JS object cannot have the same key twice: the second `speed` silently
// replaced the first. Use { speed: { $gt: 100, $lt: 120 } }, or $and when the
// conditions really must be separate objects:
print(
  '  $and of both:',
  db.readings.countDocuments({
    organizationId: 'org-north',
    $and: [{ speed: { $gt: 100 } }, { speed: { $lt: 5 } }],
  }),
  '(correctly none: no speed is both)',
);

section('3. $or and nested fields');
const alerts = db.readings.countDocuments({
  organizationId: 'org-north',
  $or: [{ speed: { $gt: 125 } }, { 'engine.rpm': { $gt: 3300 } }],
});
print('  very fast OR high rpm:', alerts);
const idling = db.readings.countDocuments({
  organizationId: 'org-north',
  speed: 0,
  'engine.on': true,
});
print('  engine on but not moving (idling):', idling);
// Dot notation reaches into embedded documents. Querying the whole embedded
// document instead ({ engine: { on: true } }) would need an EXACT match of
// all its fields in the same order, so it matches nothing here.
print(
  '  { engine: { on: true } } exact match:',
  db.readings.countDocuments({
    organizationId: 'org-north',
    engine: { on: true },
  }),
);

section('4. Q2: missing vs null vs wrong type');
const north = { organizationId: 'org-north' };
const show = (label, filter) =>
  print(
    '  ' + label.padEnd(46),
    db.readings.countDocuments({ ...north, ...filter }),
  );
show('fuelLevel: null (null OR missing)', { fuelLevel: null });
show('fuelLevel: { $exists: false } (missing)', {
  fuelLevel: { $exists: false },
});
show("fuelLevel: { $type: 'null' } (explicit null)", {
  fuelLevel: { $type: 'null' },
});
show("fuelLevel: { $type: 'string' }", { fuelLevel: { $type: 'string' } });
show("not a number: { $not: { $type: 'number' } }", {
  fuelLevel: { $not: { $type: 'number' } },
});
// { field: null } is the one to remember: it matches both null and missing.
// "No usable fuel level" is { $not: { $type: 'number' } }: missing, null and
// strings together. In SQL the column has a type, so only NULL is possible.
print(
  '  vehicles with bad fuel data:',
  db.readings.distinct('vehicleId', {
    ...north,
    fuelLevel: { $not: { $type: 'number' } },
  }),
);

section('5. Type brackets: comparisons skip other types');
show('fuelLevel > 50', { fuelLevel: { $gt: 50 } });
show("fuelLevel > '50' (a string)", { fuelLevel: { $gt: '50' } });
// The number comparison never sees the string readings of v-105, and the
// string comparison sees ONLY them (and compares text: '9' > '50').
// Wrong types do not raise errors; they disappear from results.

section('6. Which operators can the index narrow?');
const depot = ['v-101', 'v-103'];
print(
  '  $in  ',
  cost(db.readings.find({ ...north, vehicleId: { $in: depot } })),
);
print(
  '  $nin ',
  cost(db.readings.find({ ...north, vehicleId: { $nin: depot } })),
);
// $in is a set of point lookups. $nin becomes the ranges BETWEEN the excluded
// values, so here it is efficient too: keys ≈ returned. Its problem is that it
// is unselective by nature: it returns most of the data.

db.readings.createIndex({ organizationId: 1, fuelLevel: 1 });
const fuel = (label, filter) =>
  print(
    '  ' + label.padEnd(28),
    cost(db.readings.find({ ...north, ...filter })),
  );
fuel('fuelLevel < 60', { fuelLevel: { $lt: 60 } });
fuel('fuelLevel: null', { fuelLevel: null });
fuel('$exists: false', { fuelLevel: { $exists: false } });
fuel("$type: 'null'", { fuelLevel: { $type: 'null' } });
fuel("$not: { $type: 'number' }", { fuelLevel: { $not: { $type: 'number' } } });
// - A range is exact: keys = docs = returned.
// - The index stores "missing" and "null" as the same key. It finds the 30
//   candidates, but must FETCH each one to tell them apart ($exists: false
//   keeps 18, $type: 'null' keeps 12).
// - $not cannot be turned into index bounds here: every key of the tenant is
//   examined (and every document loaded) to return a few dozen readings.
// For data-quality queries that run often, store a flag at write time (e.g.
// fuelValid: false) or reject bad values on the way in (schema validation, L7).
db.readings.dropIndex({ organizationId: 1, fuelLevel: 1 });

section('7. $expr: comparing two fields of the same document');
print(
  '  rpm more than 40× speed (moving, high revs):',
  db.readings.countDocuments({
    ...north,
    speed: { $gt: 0 },
    $expr: { $gt: ['$engine.rpm', { $multiply: ['$speed', 40] }] },
  }),
);
// $expr uses aggregation expressions inside find(). It is evaluated per
// document, so put the indexable conditions (organizationId, speed) beside it.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. org-north, 07:00–07:30: readings where the vehicle idles (engine on,
//    speed 0) OR the engine is off but speed is above 0. How many of each?
//    Why is the second group empty, and is that guaranteed by the database?
// 2. Readings of org-north with a NUMERIC fuel level below 60, excluding v-101
//    and v-102. Check with cost() that the index is used.
// 3. For each kind of bad fuel value (missing, null, string), list the vehicles
//    that send it. Which single filter finds the readings a fuel-consumption
//    report must skip?
// ---------------------------------------------------------------------------
