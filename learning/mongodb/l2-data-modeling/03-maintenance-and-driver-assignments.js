// Learning Stage 2 — Exercise 03: maintenance events and many-to-many relationships
//
// Run: docker compose exec mongo mongosh --quiet learning_l2 /learning/l2-data-modeling/03-maintenance-and-driver-assignments.js
//
// Concepts
// - Drivers ↔ vehicles is many-to-many OVER TIME: a driver drives several
//   vehicles over the months, a vehicle has several drivers. The relationship
//   has its own data (startedAt, endedAt), so it gets its own collection,
//   exactly like vehicle_assignments in FleetOps.
// - Maintenance logs are append-only and time-ordered, so they are a separate
//   collection with a vehicleId and dates, not an array inside the vehicle.
// - Denormalization: copying a few fields of another document (an "extended
//   reference") to avoid a second query. Whether the copy may go stale decides
//   whether it is a good idea.
// - The right document boundary is usually the thing you query by, not the
//   thing you happen to store next to it.

load('/learning/l2-data-modeling/lib/fleet.js');
seedFleet();
db.maintenanceEvents.drop();

section('0. Access patterns');
[
  'R1  who drives vehicle X right now?                — very often',
  'R2  which vehicles did driver Y drive, and when?   — sometimes (history, audits)',
  'R3  open maintenance of one org, by due date       — often (dashboard)',
  'R4  maintenance history of one vehicle             — sometimes',
  'W1  start / end an assignment                      — a few times a day',
].forEach((p) => print('  ' + p));

section('1. Assignments: a collection for the relationship itself');
const at = (s) => ISODate('2026-' + s + 'Z');
db.assignments.insertMany([
  {
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-2',
    startedAt: at('09-01T08:00:00'),
    endedAt: at('09-15T17:00:00'),
  },
  {
    organizationId: 'org-north',
    vehicleId: 'v-102',
    driverId: 'd-1',
    startedAt: at('09-01T08:00:00'),
    endedAt: at('09-20T17:00:00'),
  },
  {
    organizationId: 'org-north',
    vehicleId: 'v-101',
    driverId: 'd-1',
    startedAt: at('09-21T08:00:00'),
    endedAt: null,
  },
  {
    organizationId: 'org-north',
    vehicleId: 'v-103',
    driverId: 'd-3',
    startedAt: at('10-01T08:00:00'),
    endedAt: null,
  },
]);

// R1: the active assignment has endedAt: null.
const current = db.assignments.findOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  endedAt: null,
});
print(
  'v-101 is driven by:',
  db.drivers.findOne({ _id: current.driverId, organizationId: 'org-north' })
    .name,
);

// R2: Mona's history, newest first — the same collection, queried the other way.
db.assignments
  .find(
    { organizationId: 'org-north', driverId: 'd-1' },
    { _id: 0, vehicleId: 1, startedAt: 1, endedAt: 1 },
  )
  .sort({ startedAt: -1 })
  .forEach((a) =>
    print(
      '   d-1 drove',
      a.vehicleId,
      'from',
      a.startedAt.toISOString().slice(0, 10),
      'to',
      a.endedAt ? a.endedAt.toISOString().slice(0, 10) : 'now',
    ),
  );

section('2. Why not arrays on both sides?');
// Alternative: vehicle.driverIds: [...] and driver.vehicleIds: [...].
// - Where do startedAt/endedAt go? They belong to the PAIR, not to either side.
// - Every change is two writes to two documents that can disagree.
// - Both arrays grow forever.
// Arrays of ids work for small, bounded, attribute-less many-to-many (e.g.
// tags). An assignment history is none of those.
print(
  'arrays on both sides: no place for dates, two writes per change, unbounded growth',
);

section('3. Rules the model does not enforce');
// FleetOps rule: a vehicle has at most ONE active assignment. Nothing above
// stops a second { vehicleId: 'v-101', endedAt: null } from being inserted.
db.assignments.insertOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  driverId: 'd-3',
  startedAt: at('10-05T08:00:00'),
  endedAt: null,
});
print(
  'active assignments for v-101:',
  db.assignments.countDocuments({ vehicleId: 'v-101', endedAt: null }),
  '(should be 1)',
);
// PostgreSQL FleetOps enforces this in the database. In MongoDB the usual tool
// is a partial unique index on { vehicleId } where endedAt is null — L3.
db.assignments.deleteOne({ vehicleId: 'v-101', driverId: 'd-3' });

section(
  '4. Maintenance events in their own collection, with an extended reference',
);
// Each event copies the vehicle plate (an extended reference) so a dashboard
// can list events without a second query to vehicles.
db.maintenanceEvents.insertMany([
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-101', plate: 'ABC-123' },
    status: 'open',
    type: 'oil-change',
    openedAt: at('10-04T08:00:00'),
    dueAt: at('10-11T08:00:00'),
  },
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-101', plate: 'ABC-123' },
    status: 'closed',
    type: 'tire-rotation',
    openedAt: at('09-20T07:00:00'),
    closedAt: at('09-24T10:00:00'),
    costEgp: NumberDecimal('1450.00'),
  },
  {
    organizationId: 'org-north',
    vehicle: { _id: 'v-102', plate: 'ABC-124' },
    status: 'open',
    type: 'inspection',
    openedAt: at('10-05T09:00:00'),
    dueAt: at('10-12T09:00:00'),
  },
]);

// R3: no join needed, the plate is already in the event.
db.maintenanceEvents
  .find(
    { organizationId: 'org-north', status: 'open' },
    { _id: 0, 'vehicle.plate': 1, type: 1, dueAt: 1 },
  )
  .sort({ dueAt: 1 })
  .forEach((e) =>
    print(
      '  ',
      e.vehicle.plate,
      e.type,
      'due',
      e.dueAt.toISOString().slice(0, 10),
    ),
  );

section('5. When the copy goes stale');
// The vehicle gets a new plate.
db.vehicles.updateOne(
  { _id: 'v-101', organizationId: 'org-north' },
  { $set: { plate: 'NEW-777' } },
);
const plates = db.maintenanceEvents.distinct('vehicle.plate', {
  'vehicle._id': 'v-101',
});
print('vehicle plate now: NEW-777 | plates in its events:', plates.join(', '));
// Two valid answers, and the model must pick one on purpose:
// - The event records the plate AT THE TIME of the service. Then the old plate
//   is correct history, and the copy must never be updated (a snapshot).
// - The event should always show the current plate. Then every plate change
//   must also run updateMany on maintenanceEvents (and can fail halfway).
// Copy fields that never change, or whose old value is meaningful. Do not copy
// fields that change often and must always be current.

section('6. When arrays become a smell');
// If every vehicle stored a complete history of all maintenance actions in a
// large and growing `maintenanceHistory` array, the vehicle documents would grow
// constantly and every query for the current status would have to read a noisy
// payload. A dedicated maintenance collection gives each event its own timestamp,
// status and lifecycle, which is much easier to query and update.
print('history that grows without limit → its own collection');

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Write a query that returns all open maintenance events for v-101 sorted by
//    due date ascending.
// 2. In one paragraph, explain why `maintenanceEvents` is a better shape than an
//    ever-growing `maintenanceHistory` array on each vehicle.
// 3. If a driver can drive multiple vehicles over time, would you keep history in
//    `vehicles` or in a separate assignment collection? Explain briefly.
// 4. End Mona's (d-1) current assignment and start a new one for her on v-102,
//    using two writes. What can go wrong between the two writes?
// 5. Is it safe to copy the driver's NAME into each assignment document? Is it
//    safe to copy the driver's license expiry date? Why the difference?
// ---------------------------------------------------------------------------
