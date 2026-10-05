// Learning Stage 2 — Exercise 01: organization and vehicle modeling
//
// Run: docker compose exec mongo mongosh --quiet learning_l2 /learning/l2-data-modeling/01-organization-and-vehicles.js
//
// Concepts
// - Access patterns come before the schema. List how the data is read and
//   written, then pick the model that makes the frequent operations cheap.
// - One-to-one data that is always read with its parent is embedded
//   (vehicle.registration).
// - One-to-many where the "many" side is large, updated on its own, or
//   queried on its own is referenced: vehicles get their own collection.
// - Hot fields (change every few seconds, e.g. location) and cold fields
//   (rarely change, e.g. VIN) are often kept in different documents.

load('/learning/l2-data-modeling/lib/fleet.js');
seedFleet();

section('0. Access patterns (write these BEFORE choosing a model)');
[
  'R1  list the vehicles of one organization (paged, filtered by status)  — often',
  'R2  show one vehicle with its registration details                     — often',
  'W1  change one vehicle status                                          — often',
  'W2  update a vehicle location                                          — every few seconds',
  'R3  show the organization name/region                                  — rarely changes',
].forEach((p) => print('  ' + p));

section('1. Model A: the organization document embeds a vehicle array');
db.org_embedded.drop();
db.org_embedded.insertOne({
  _id: 'org-north',
  name: 'North Fleet',
  region: 'Cairo',
  vehicles: db.vehicles
    .find({ organizationId: 'org-north' }, { organizationId: 0 })
    .toArray(),
});
printjson(
  db.org_embedded.findOne(
    { _id: 'org-north' },
    { _id: 0, name: 1, 'vehicles.plate': 1, 'vehicles.status': 1 },
  ),
);

section('2. W1 in Model A: update one element inside the array');
// The positional operator $ updates the array element the filter matched.
let r = db.org_embedded.updateOne(
  { _id: 'org-north', 'vehicles._id': 'v-101' },
  { $set: { 'vehicles.$.status': 'offline' } },
);
print('modified:', r.modifiedCount);
// It works, but every vehicle change in the whole organization is a write to
// the SAME document. Writes to one document are serialized, so a 5 000-vehicle
// fleet sending status changes all contends for one document.

section('3. R1 in Model A: the whole array comes back');
// "Vehicles in maintenance" cannot be answered by returning only matching documents:
// the match is on the organization, so you get the organization (or you need
// an aggregation with $filter / $unwind — L5).
const orgDoc = db.org_embedded.findOne({
  _id: 'org-north',
  'vehicles.status': 'maintenance',
});
print(
  'vehicles returned:',
  orgDoc.vehicles.length,
  '(only 1 is in maintenance)',
);

section('4. How big does Model A get? (measured)');
// Grow the embedded array to a realistic fleet and measure the document.
const fleet = [];
for (let i = 0; i < 5000; i++) {
  fleet.push({
    _id: 'v-' + i,
    plate: 'P-' + String(i).padStart(5, '0'),
    status: 'active',
    registration: {
      vin: 'VIN' + String(i).padStart(14, '0'),
      make: 'Toyota',
      model: 'Hilux',
      year: 2022,
    },
  });
}
const bigOrg = { _id: 'org-big', name: 'Big Fleet', vehicles: fleet };
print('5 000 vehicles in one document:', kb(bsonsize(bigOrg)));
print('one vehicle on its own:        ', kb(bsonsize(fleet[0])));
// ~0.75 MB is under the 16 MB limit, so the limit is NOT the main problem here.
// The real costs: every read of the organization drags 5 000 vehicles along,
// every update rewrites part of a big document, and all writers share one
// document. Add a location history per vehicle and the limit arrives fast (04).

section(
  '5. Model B: vehicles in their own collection (referenced by organizationId)',
);
// R1: only matching vehicles come back, and paging works per vehicle.
db.vehicles
  .find({ organizationId: 'org-north', status: 'active' }, { _id: 1, plate: 1 })
  .forEach((v) => print('  ', JSON.stringify(v)));
// W1: a small write to one small document; different vehicles never contend.
r = db.vehicles.updateOne(
  { _id: 'v-101', organizationId: 'org-north' },
  { $set: { status: 'offline' } },
);
print('modified:', r.modifiedCount);
// R2: one-to-one registration is embedded, so one read returns everything.
printjson(
  db.vehicles.findOne({ _id: 'v-102' }, { _id: 0, plate: 1, registration: 1 }),
);

section('6. Tenant isolation is part of the model');
// Every query on tenant data includes organizationId, as in FleetOps. Asking
// for another organization's vehicle by _id returns nothing (→ 404 in an API).
print(
  'org-north asks for v-901:',
  db.vehicles.findOne({ _id: 'v-901', organizationId: 'org-north' }),
);

section('7. Hot vs cold fields');
// W2 (location every few seconds) would rewrite the vehicle document that R1
// and R2 read. Location is a different access pattern with a different
// lifecycle, so it lives elsewhere: the latest value in a small status
// document, the history in a telemetry collection (exercise 02).
print('vehicle document stays cold: plate, status, registration');
print(
  'hot data moves out:         latest position → vehicleStatus, history → telemetry',
);

// Decision for this domain: Model B. organizations and vehicles are separate
// collections joined by organizationId; registration is embedded (one-to-one).

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. Write a query that returns the vehicles for org-north with active status
//    and a driverId filter. (The seed has no driverId on vehicles: decide
//    where "current driver" should live first — see exercise 03.)
// 2. Explain in two sentences why a vehicle array embedded in the org document
//    becomes awkward once the fleet grows to thousands of vehicles. Use the
//    numbers from sections 3 and 4.
// 3. For this FleetOps domain, would you place current driver information inside
//    the vehicle document or in a separate drivers collection? Why?
// 4. Name one piece of data you WOULD embed in the organization document, and
//    the access pattern that justifies it.
// ---------------------------------------------------------------------------
