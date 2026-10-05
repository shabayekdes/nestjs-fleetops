// Solutions — Exercise 03
load('/learning/l2-data-modeling/lib/fleet.js');
seedFleet();
db.maintenanceEvents.drop();
const at = (s) => ISODate('2026-' + s + 'Z');
db.maintenanceEvents.insertMany([
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-101', plate: 'ABC-123' },
    status: 'open',
    type: 'oil-change',
    dueAt: at('10-11T08:00:00'),
  },
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-101', plate: 'ABC-123' },
    status: 'open',
    type: 'brakes',
    dueAt: at('10-08T08:00:00'),
  },
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-101', plate: 'ABC-123' },
    status: 'closed',
    type: 'tire-rotation',
    closedAt: at('09-24T10:00:00'),
  },
]);
db.assignments.insertOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  driverId: 'd-1',
  startedAt: at('09-21T08:00:00'),
  endedAt: null,
});

section('1. Open maintenance events for v-101, by due date');
db.maintenanceEvents
  .find(
    { organizationId: 'org-north', 'vehicle._id': 'v-101', status: 'open' },
    { _id: 0, type: 1, dueAt: 1 },
  )
  .sort({ dueAt: 1 })
  .forEach((e) => print('  ', e.type, e.dueAt.toISOString().slice(0, 10)));

section('2. Why the separate collection is better');
print(
  'Maintenance history is a timeline of independent events, each with its own status,',
  'dates and cost. A collection lets you query by vehicle, date, status and type, page',
  'through it, and add events without rewriting the vehicle. An array on the vehicle',
  'grows without limit and is read every time the vehicle is.',
);

section('3. Driver assignment over time');
print(
  'A separate assignments collection: the dates belong to the driver–vehicle pair,',
  'and the same collection answers both "who drives X" and "what did Y drive".',
);

section('4. Reassign Mona with two writes');
const now = at('10-05T12:00:00');
db.assignments.updateOne(
  { organizationId: 'org-north', driverId: 'd-1', endedAt: null },
  { $set: { endedAt: now } },
);
// <-- a crash or error here leaves Mona with no active assignment at all.
db.assignments.insertOne({
  organizationId: 'org-north',
  vehicleId: 'v-102',
  driverId: 'd-1',
  startedAt: now,
  endedAt: null,
});
print(
  'active for d-1:',
  db.assignments.countDocuments({ driverId: 'd-1', endedAt: null }),
);
print(
  'Between the writes the data is inconsistent, and if the second fails it stays so.',
  'Another request could also assign v-102 to someone else in between. FleetOps',
  'solves this with a PostgreSQL transaction; MongoDB needs a multi-document',
  'transaction (replica set, L14) or a model where one write is enough.',
);

section('5. Copying driver fields into assignments');
print(
  'The name at the time of the assignment is fine to copy: it is display data, and an',
  'old value is harmless (or even correct history). The license expiry is NOT safe:',
  'it drives a business rule ("expired license cannot be assigned"), changes on',
  'renewal, and a stale copy would give a wrong answer. Read it from the driver.',
);
