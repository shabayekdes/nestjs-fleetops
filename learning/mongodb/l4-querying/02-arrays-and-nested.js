// Learning Stage 4 — Exercise 02: arrays and nested documents
//
// Run: docker compose exec mongo mongosh --quiet learning_l4 /learning/l4-querying/02-arrays-and-nested.js
//
// Concepts
// - A condition on an array field matches if ANY element matches.
// - With an array of subdocuments, several conditions written with dot
//   notation may be satisfied by DIFFERENT elements. $elemMatch requires ONE
//   element to satisfy all of them. Mixing them up gives wrong results with no
//   error.
// - $all: every listed value is present. $size: exact array length (no ranges).
// - Updating elements in place: $ (the first element the filter matched),
//   $[] (all elements), $[name] with arrayFilters (the elements that match).
//
// Data: some readings carry diagnostics, an array such as
//   [{ code: 'P0300', severity: 'high' }, { code: 'P0420', severity: 'low' }]

load('/learning/l4-querying/lib/telemetry.js');
print('readings:', seedReadings());
const north = { organizationId: 'org-north' };
const count = (label, filter) =>
  print(
    '  ' + label.padEnd(44),
    db.readings.countDocuments({ ...north, ...filter }),
  );

section('1. Any element matches');
count('with any diagnostics', { diagnostics: { $exists: true } });
count("diagnostics.code: 'P0300'", { 'diagnostics.code': 'P0300' });
count("diagnostics.code $in ['P0300','P0420']", {
  'diagnostics.code': { $in: ['P0300', 'P0420'] },
});

section('2. Dot notation vs $elemMatch');
count('dot: code P0300 AND severity high', {
  'diagnostics.code': 'P0300',
  'diagnostics.severity': 'high',
});
count('$elemMatch: one element with both', {
  diagnostics: { $elemMatch: { code: 'P0300', severity: 'high' } },
});
const mixed = db.readings.findOne({
  ...north,
  'diagnostics.code': 'P0300',
  'diagnostics.severity': 'high',
  diagnostics: { $not: { $elemMatch: { code: 'P0300', severity: 'high' } } },
});
print('  a reading the dot version wrongly matches:');
print('   ', JSON.stringify(mixed.diagnostics));
// P0300 is in one element and 'high' in another. For "a high-severity P0300",
// the dot version is a bug. Rule: two or more conditions on the SAME element
// of an array of subdocuments → $elemMatch.

section('3. Exact array match, $all and $size');
count("exact: [{ code: 'P0300', severity: 'medium' }]", {
  diagnostics: [{ code: 'P0300', severity: 'medium' }],
});
count('same, fields swapped: [{ severity, code }]', {
  diagnostics: [{ severity: 'medium', code: 'P0300' }],
});
count('$all: both P0300 and P0420 present', {
  'diagnostics.code': { $all: ['P0300', 'P0420'] },
});
count('$size: 2 (exactly two codes)', { diagnostics: { $size: 2 } });
// An array literal matches only an array with exactly those elements, in that
// order, each with exactly those fields IN THAT ORDER: swapping code and
// severity matches nothing. Almost never what you want for subdocuments. $size accepts
// only an exact number; "two or more" is { 'diagnostics.1': { $exists: true } }.
count("'diagnostics.1' exists (two or more)", {
  'diagnostics.1': { $exists: true },
});

section('4. Projection of array elements');
const one = db.readings.findOne(
  { ...north, diagnostics: { $elemMatch: { severity: 'high' } } },
  { _id: 0, vehicleId: 1, 'diagnostics.$': 1 },
);
print('  diagnostics.$ (first matching element only):', JSON.stringify(one));
// Useful when arrays are long and only the matching element is needed.
// $filter (L5) returns all matching elements.

section('5. Updating elements in place');
const target = db.readings.findOne(
  {
    ...north,
    vehicleId: 'v-101',
    'diagnostics.1': { $exists: true },
  },
  { _id: 1 },
)._id;
const showDiag = () =>
  print(
    '   ',
    JSON.stringify(db.readings.findOne({ _id: target }).diagnostics),
  );
print('  before:');
showDiag();

// $ — the first element matched by the filter.
db.readings.updateOne(
  { _id: target, 'diagnostics.severity': 'low' },
  { $set: { 'diagnostics.$.acknowledged': true } },
);
print('  after $ (first low-severity element acknowledged):');
showDiag();

// $[] — every element.
db.readings.updateOne(
  { _id: target },
  { $set: { 'diagnostics.$[].reviewedBy': 'ops' } },
);
print('  after $[] (every element reviewed):');
showDiag();

// $[h] with arrayFilters — every element that matches the filter.
db.readings.updateOne(
  { _id: target },
  { $set: { 'diagnostics.$[h].escalated': true } },
  { arrayFilters: [{ 'h.severity': 'high' }] },
);
print("  after $[h] with arrayFilters { 'h.severity': 'high' }:");
showDiag();
// All three are single-document atomic updates: no read-modify-write in the
// application, so a concurrent update cannot be lost.

section('6. $push with $each and $slice: a bounded "recent codes" list');
db.vehicleStatus.drop();
db.vehicleStatus.insertOne({ _id: 'v-101', ...north, recentCodes: [] });
db.readings
  .find({ ...north, vehicleId: 'v-101', diagnostics: { $exists: true } })
  .sort({ timestamp: 1 })
  .forEach((r) =>
    db.vehicleStatus.updateOne(
      { _id: 'v-101' },
      {
        $push: {
          recentCodes: {
            $each: r.diagnostics.map((d) => ({
              code: d.code,
              at: r.timestamp,
            })),
            $slice: -5,
          },
        },
      },
    ),
  );
const status = db.vehicleStatus.findOne({ _id: 'v-101' });
print('  recentCodes kept:', status.recentCodes.length);
print('  newest:', JSON.stringify(status.recentCodes[4]));
// $slice: -5 keeps only the last 5 after each push: the array stays bounded
// (L2's rule) no matter how many codes arrive.

section('7. Indexing a field inside an array');
db.readings.createIndex({
  organizationId: 1,
  'diagnostics.code': 1,
  'diagnostics.severity': 1,
});
print(
  '  $elemMatch',
  cost(
    db.readings.find({
      ...north,
      diagnostics: { $elemMatch: { code: 'P0300', severity: 'high' } },
    }),
  ),
);
// A multikey index (L3). With $elemMatch, MongoDB can bound both fields
// together because they must come from the same element.
db.readings.dropIndexes();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. Readings of org-north with a medium-severity P0171. Write it with
//    $elemMatch, then with dot notation, and explain the difference in counts
//    (if any).
// 2. Readings of v-102 whose ONLY diagnostic is P0128 (one element, that code).
// 3. On every org-north reading, set severity to 'critical' for elements with
//    code P0300 and severity 'high'. How many documents were modified? Prove
//    no 'low' P0300 element changed.
// ---------------------------------------------------------------------------
