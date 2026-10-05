// Solutions — Exercise 04. Run exercise 04 first: these use readings_hourly.
load('/learning/l2-data-modeling/lib/fleet.js');

section('1. Max speed of v-105 per hour');
const buckets = db.readings_hourly
  .find(
    { organizationId: 'org-north', vehicleId: 'v-105' },
    { _id: 0, hour: 1, maxSpeed: 1 },
  )
  .sort({ hour: 1 })
  .toArray();
buckets.forEach((b) =>
  print('  ', b.hour.toISOString().slice(11, 16), b.maxSpeed),
);
print(
  'documents read:',
  buckets.length,
  '| flat collection would need',
  buckets.length * 360,
);
// The precomputed maxSpeed means the readings array is not even returned
// (the projection leaves it out).

section('2. One bucket per vehicle per day');
const day = [];
for (let i = 0; i < 8640; i++) {
  const { timestamp, speed, fuelLevel, engineOn, location } = reading(
    'v-101',
    ISODate('2026-10-05T00:00:00Z'),
    i,
  );
  day.push({ t: timestamp, speed, fuelLevel, engineOn, location });
}
print(
  '8 640 readings per day →',
  kb(
    bsonsize({
      organizationId: 'org-north',
      vehicleId: 'v-101',
      readings: day,
    }),
  ),
);
print(
  'Still under 16 MB and still bounded, but every write rewrites a ~1 MB document and',
  'every short-range read transfers a whole day. One hour is a better trade-off here.',
);

section('3. A device sends 2 hours of late readings');
print(
  "Yes: addReading() computes the hour from each reading's own timestamp, not from",
  'the current time, so late readings land in their correct (older) buckets. The',
  'order inside a bucket array may then not be chronological — sort when reading.',
);
