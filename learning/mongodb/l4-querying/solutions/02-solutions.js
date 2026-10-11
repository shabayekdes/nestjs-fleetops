// Solutions — Exercise 02
load('/learning/l4-querying/lib/telemetry.js');
print('readings:', seedReadings());
const north = { organizationId: 'org-north' };

section('1. A medium-severity P0171');
const elem = db.readings.countDocuments({
  ...north,
  diagnostics: { $elemMatch: { code: 'P0171', severity: 'medium' } },
});
const dot = db.readings.countDocuments({
  ...north,
  'diagnostics.code': 'P0171',
  'diagnostics.severity': 'medium',
});
print('  $elemMatch:', elem, '| dot notation:', dot);
// In this data 'medium' only appears in single-element arrays, so both agree.
// That is luck, not correctness: the first two-element reading with P0171 low
// and another code medium would make them differ. Write $elemMatch.

section('2. v-102 readings whose only diagnostic is P0128');
const only = db.readings.countDocuments({
  ...north,
  vehicleId: 'v-102',
  diagnostics: { $size: 1 },
  'diagnostics.code': 'P0128',
});
print('  count:', only);
// $size: 1 plus the code. (An exact array match would also need the exact
// severity and field order.)

section('3. Escalate high P0300 to critical');
const before = db.readings.countDocuments({
  ...north,
  diagnostics: { $elemMatch: { code: 'P0300', severity: 'low' } },
});
const r = db.readings.updateMany(
  {
    ...north,
    diagnostics: { $elemMatch: { code: 'P0300', severity: 'high' } },
  },
  { $set: { 'diagnostics.$[d].severity': 'critical' } },
  { arrayFilters: [{ 'd.code': 'P0300', 'd.severity': 'high' }] },
);
print('  modified documents:', r.modifiedCount);
print(
  '  low P0300 elements before/after:',
  before,
  '/',
  db.readings.countDocuments({
    ...north,
    diagnostics: { $elemMatch: { code: 'P0300', severity: 'low' } },
  }),
);
print(
  '  high P0300 left:',
  db.readings.countDocuments({
    ...north,
    diagnostics: { $elemMatch: { code: 'P0300', severity: 'high' } },
  }),
);
// The filter selects documents; arrayFilters selects elements inside them.
// Both need the same pair of conditions.
