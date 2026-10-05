// Solutions — Exercise 01
load('/learning/l2-data-modeling/lib/fleet.js');
seedFleet();
db.assignments.insertOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  driverId: 'd-1',
  startedAt: new Date(),
  endedAt: null,
});

section('1. Active vehicles of org-north driven by d-1');
// "Current driver" lives in the assignments collection (exercise 03), so the
// query has two steps: the driver's active assignments, then those vehicles.
const vehicleIds = db.assignments.distinct('vehicleId', {
  organizationId: 'org-north',
  driverId: 'd-1',
  endedAt: null,
});
db.vehicles
  .find(
    { organizationId: 'org-north', status: 'active', _id: { $in: vehicleIds } },
    { _id: 0, plate: 1, status: 1 },
  )
  .forEach(printjson);
// If this query were very frequent, copying currentDriverId into the vehicle
// (a denormalized cache) would make it one query — at the cost of keeping two
// documents in sync on every assignment change.

section('2. Why embedding gets awkward');
print(
  'With 5 000 vehicles the organization document is ~0.75 MB, and every read of it',
  'returns all of them even when one matches. Every status change of any vehicle',
  'is a write to that one document, so all writers contend on it.',
);

section('3. Driver info decision');
print(
  'Driver details (name, license) belong in a drivers collection: drivers exist on',
  'their own and change independently. Who drives a vehicle is a relationship with',
  'dates, so it belongs in assignments. At most, the vehicle keeps a small',
  'currentDriverId cache for fast reads.',
);

section('4. Something worth embedding in the organization');
print(
  'Small, bounded settings read with the organization every time, e.g.',
  '{ settings: { timezone, currency, distanceUnit } }. Bounded, rarely changed,',
  'always read together: the textbook case for embedding.',
);
