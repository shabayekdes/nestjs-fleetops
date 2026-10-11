// Solutions — Exercise 02
load('/learning/l3-indexing/lib/telemetry.js');
print('readings:', seedReadings());

const org = 'org-north';
const day1 = {
  $gte: ISODate('2026-10-05T00:00:00Z'),
  $lt: ISODate('2026-10-06T00:00:00Z'),
};

section('1. Idle report: engine off, one day, newest first');
// E: organizationId, engineOn  S: timestamp  R: timestamp (same field)
db.readings.createIndex({ organizationId: 1, engineOn: 1, timestamp: -1 });
report(
  'idle report',
  measure(
    db.readings
      .find({ organizationId: org, engineOn: false, timestamp: day1 })
      .sort({ timestamp: -1 }),
  ),
);
// When the sort field is also the range field, ESR is simply E then that field:
// one contiguous block, already in order. keys = docs = returned.
db.readings.dropIndexes();

section('2. Which sorts can the index provide?');
db.readings.createIndex({ organizationId: 1, vehicleId: 1, timestamp: -1 });
const base = () =>
  db.readings.find({ organizationId: org, vehicleId: 'v-101' });
report(
  'sort { vehicleId: 1, timestamp: 1 }',
  measure(base().sort({ vehicleId: 1, timestamp: 1 })),
);
report(
  'sort { timestamp: -1, speed: -1 }',
  measure(base().sort({ timestamp: -1, speed: -1 })),
);
// No SORT for the first: vehicleId is fixed by equality, so sorting by it is
// free, and timestamp: 1 is the index walked backwards.
// SORT for the second: speed is not in the index, so ties on timestamp cannot
// be ordered by it. (Here timestamps never tie, but MongoDB cannot know that.)
db.readings.dropIndexes();

section('3. A covered fuel chart');
db.readings.createIndex({
  organizationId: 1,
  vehicleId: 1,
  timestamp: -1,
  fuelLevel: 1,
});
report(
  'fuel chart',
  measure(
    db.readings
      .find(
        { organizationId: org, vehicleId: 'v-101', timestamp: day1 },
        { _id: 0, timestamp: 1, fuelLevel: 1 },
      )
      .sort({ timestamp: -1 }),
  ),
);
// docsExamined 0. The price is a wider index on every insert: a covered query
// is an optimisation for a hot read path, not a default.
db.readings.dropIndexes();
