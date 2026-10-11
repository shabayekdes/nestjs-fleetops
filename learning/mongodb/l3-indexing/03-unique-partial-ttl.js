// Learning Stage 3 — Exercise 03: unique, partial and TTL indexes
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/03-unique-partial-ttl.js
//
// Concepts
// - A unique index is MongoDB's only way to enforce "no two documents share
//   this value". It is checked inside the write, so two concurrent inserts
//   cannot both succeed (unlike a find-then-insert check in code).
// - Tenant-scoped uniqueness: { organizationId, plate } unique, like
//   @@unique([organizationId, plate]) in the FleetOps Prisma schema.
// - A partial index only contains documents that match its
//   partialFilterExpression. A partial UNIQUE index enforces uniqueness only
//   among those documents: "one ACTIVE assignment per vehicle".
// - A TTL index deletes documents once a date field is older than
//   expireAfterSeconds. A background task does it (every 60 s by default), so
//   expiry is approximate, never instant.

load('/learning/l3-indexing/lib/telemetry.js');

function tryWrite(label, fn) {
  try {
    fn();
    print('  ' + label + ': ok');
  } catch (e) {
    // The server message names the index that refused the write.
    const msg = e.message.slice(Math.max(0, e.message.indexOf('E11000')));
    print('  ' + label + ': rejected, ' + msg.split(' dup key')[0]);
  }
}

section('1. Tenant-scoped unique index');
db.vehicles.drop();
db.vehicles.createIndex(
  { organizationId: 1, plate: 1 },
  { unique: true, name: 'org_plate_unique' },
);
db.vehicles.insertOne({ organizationId: 'org-north', plate: 'ABC-123' });
tryWrite('same plate, same org', () =>
  db.vehicles.insertOne({ organizationId: 'org-north', plate: 'ABC-123' }),
);
tryWrite('same plate, other org', () =>
  db.vehicles.insertOne({ organizationId: 'org-south', plate: 'ABC-123' }),
);
// Code 11000 (DuplicateKey) is the error to catch in application code and turn
// into a 409 Conflict, like Prisma's P2002 in FleetOps.

section('2. A unique index cannot be built over existing duplicates');
db.vehicles.dropIndexes();
db.vehicles.insertOne({ organizationId: 'org-north', plate: 'ABC-123' });
tryWrite('create unique index', () =>
  db.vehicles.createIndex({ organizationId: 1, plate: 1 }, { unique: true }),
);
// Same as adding @@unique to a Prisma model over dirty data: clean up first.
// Without the index from day one, duplicates get in and must be found by hand:
db.vehicles
  .aggregate([
    {
      $group: {
        _id: { organizationId: '$organizationId', plate: '$plate' },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ])
  .forEach((d) => print('  duplicate:', JSON.stringify(d)));

section('3. Unique and missing fields');
db.vehicles.drop();
db.vehicles.createIndex({ organizationId: 1, vin: 1 }, { unique: true });
db.vehicles.insertOne({ organizationId: 'org-north', plate: 'A-1' });
tryWrite('second vehicle without a vin', () =>
  db.vehicles.insertOne({ organizationId: 'org-north', plate: 'A-2' }),
);
// A missing field is indexed as null, so two vehicles without a VIN collide.
// Fix: index only documents that have the field.
db.vehicles.drop();
db.vehicles.createIndex(
  { organizationId: 1, vin: 1 },
  { unique: true, partialFilterExpression: { vin: { $type: 'string' } } },
);
db.vehicles.insertOne({ organizationId: 'org-north', plate: 'A-1' });
tryWrite('second vehicle without a vin (partial)', () =>
  db.vehicles.insertOne({ organizationId: 'org-north', plate: 'A-2' }),
);
db.vehicles.insertOne({ organizationId: 'org-north', plate: 'A-3', vin: 'V1' });
tryWrite('duplicate vin (partial)', () =>
  db.vehicles.insertOne({
    organizationId: 'org-north',
    plate: 'A-4',
    vin: 'V1',
  }),
);
// PostgreSQL behaves like the partial version by default: NULLs never
// conflict in a unique constraint.

section('4. Partial unique: one active assignment per vehicle');
// L2 left this rule unprotected. The model: endedAt is null while active.
db.assignments.drop();
db.assignments.createIndex(
  { organizationId: 1, vehicleId: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
    name: 'one_active_per_vehicle',
  },
);
db.assignments.insertMany([
  {
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-1',
    startedAt: ISODate('2026-09-01T08:00:00Z'),
    endedAt: ISODate('2026-09-15T17:00:00Z'),
  },
  {
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-2',
    startedAt: ISODate('2026-09-16T08:00:00Z'),
    endedAt: null,
  },
]);
tryWrite('second active assignment for v-101', () =>
  db.assignments.insertOne({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-3',
    startedAt: ISODate('2026-10-01T08:00:00Z'),
    endedAt: null,
  }),
);
tryWrite('another ended assignment for v-101', () =>
  db.assignments.insertOne({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-3',
    startedAt: ISODate('2026-08-01T08:00:00Z'),
    endedAt: ISODate('2026-08-02T08:00:00Z'),
  }),
);
// Ended assignments are not in the index at all, so history is unlimited. Only
// one document per vehicle can match endedAt: null.
// Same idea as the FleetOps PostgreSQL partial unique index on
// vehicle_assignments (WHERE ended_at IS NULL).
//
// Careful: { endedAt: null } also matches documents with NO endedAt field.
// Always write endedAt: null explicitly, or a forgotten field counts as active.
// ($exists: false is not allowed in a partial filter; $type: 'null' is, if you
// want to match only an explicit null.)

section('5. The planner uses a partial index only when the query implies it');
const active = { organizationId: 'org-north', vehicleId: 'v-101' };
report(
  'with endedAt: null',
  measure(db.assignments.find({ ...active, endedAt: null })),
);
report('without endedAt', measure(db.assignments.find(active)));
// Without endedAt: null in the filter, the partial index might miss matching
// documents (the ended ones), so MongoDB cannot use it.

section('6. TTL: raw readings expire on their own');
db.readings_raw.drop();
db.readings_raw.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 7 * 24 * 3600, name: 'expire_after_7_days' },
);
const now = new Date();
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 3600 * 1000);
db.readings_raw.insertMany([
  { organizationId: 'org-north', vehicleId: 'v-101', timestamp: daysAgo(10) },
  { organizationId: 'org-north', vehicleId: 'v-101', timestamp: daysAgo(8) },
  { organizationId: 'org-north', vehicleId: 'v-101', timestamp: daysAgo(1) },
  { organizationId: 'org-north', vehicleId: 'v-101', timestamp: now },
  // Not a date: a TTL index ignores it, so this document never expires.
  { organizationId: 'org-north', vehicleId: 'v-101', timestamp: 'yesterday' },
  // No timestamp at all: never expires either.
  { organizationId: 'org-north', vehicleId: 'v-101' },
]);
print('  before:', db.readings_raw.countDocuments());
// The TTL monitor wakes every 60 s. For the exercise, make it wake every
// second, wait, and put it back. (Never do this on a real server.)
db.adminCommand({ setParameter: 1, ttlMonitorSleepSecs: 1 });
sleep(3000);
db.adminCommand({ setParameter: 1, ttlMonitorSleepSecs: 60 });
print('  after: ', db.readings_raw.countDocuments());
db.readings_raw
  .find({}, { _id: 0, timestamp: 1 })
  .forEach((d) => print('    kept:', d.timestamp ?? '(no timestamp)'));
// The 10- and 8-day-old readings are gone. A wrong type silently disables
// expiry for that document: the type pitfall from L1 again.

section('7. Changing the retention without rebuilding');
db.runCommand({
  collMod: 'readings_raw',
  index: { name: 'expire_after_7_days', expireAfterSeconds: 30 * 24 * 3600 },
});
print(
  '  expireAfterSeconds now:',
  db.readings_raw.getIndexes().find((i) => i.name === 'expire_after_7_days')
    .expireAfterSeconds,
);
// The name is now misleading: name indexes after their keys or purpose, not
// after a setting that can change.
//
// TTL limits: one date field per TTL index, a single-field index only, and
// deletes are ordinary deletes (they cost write work and replicate). Deleting
// millions of readings a day this way is heavy; exercise 06 shows the time
// series alternative, which drops whole buckets.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Drivers: a license number must be unique per organization, but drivers
//    may be created before their license is known. Create the index and show
//    both cases.
// 2. A maintenance work order can be 'open' or 'closed', and a vehicle may have
//    only one open work order. Enforce it with an index and prove it.
// 3. Raw telemetry must be kept 90 days. What is expireAfterSeconds? A device
//    sends timestamps as epoch milliseconds (numbers). What happens to those
//    readings, and how would you catch it early?
// ---------------------------------------------------------------------------
