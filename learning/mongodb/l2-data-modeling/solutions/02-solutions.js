// Solutions — Exercise 02
load('/learning/l2-data-modeling/lib/fleet.js');
db.telemetry.drop();
const start = ISODate('2026-10-05T08:00:00Z');
const docs = [];
for (let i = 0; i < 90; i++)
  docs.push({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    ...reading('v-101', start, i),
  });
db.telemetry.insertMany(docs);

section('1. v-101 readings above 60 in 08:00–08:15');
const fast = db.telemetry
  .find(
    {
      organizationId: 'org-north',
      vehicleId: 'v-101',
      timestamp: {
        $gte: ISODate('2026-10-05T08:00:00Z'),
        $lt: ISODate('2026-10-05T08:15:00Z'),
      },
      speed: { $gt: 60 },
    },
    { _id: 0, timestamp: 1, speed: 1 },
  )
  .sort({ timestamp: 1 })
  .toArray();
print(
  fast.length,
  'readings, first:',
  fast[0].timestamp.toISOString(),
  fast[0].speed,
);

section('2. Decision');
print(
  'A dedicated telemetry collection: 1 000 vehicles × 8 640 readings/day is',
  (1000 * 8640).toLocaleString('en'),
  'documents per day, read by time range.',
  'Embedded in the vehicle, each document would reach 16 MB in ~2 weeks and every',
  'write would rewrite a growing document. (Exercise 04 shows buckets as a middle ground.)',
);

section('3. When a summary helps');
print(
  'vehicleStatus helps when current state is read far more often than history',
  '(a live map polling every few seconds): one tiny document per vehicle. It is a',
  'problem when it must be exactly right — it can lag or be wrong if the second',
  'write fails, and it doubles the writes per reading.',
);

section('4. Why the vehicle id is the _id of vehicleStatus');
print(
  '_id is unique by default, so "one status document per vehicle" is enforced by',
  'the database with no extra index, and the upsert can never create a duplicate.',
  'It is also what turns a late, older reading into a duplicate-key error instead',
  'of a second status document.',
);
