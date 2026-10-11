// Solutions — Exercise 03
load('/learning/l3-indexing/lib/telemetry.js');

function tryWrite(label, fn) {
  try {
    fn();
    print('  ' + label + ': ok');
  } catch (e) {
    print('  ' + label + ': rejected (code ' + e.code + ')');
  }
}

section('1. License number: unique per organization, optional');
db.drivers.drop();
db.drivers.createIndex(
  { organizationId: 1, licenseNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { licenseNumber: { $type: 'string' } },
  },
);
db.drivers.insertOne({ organizationId: 'org-north', name: 'Mona' });
tryWrite('second driver without license', () =>
  db.drivers.insertOne({ organizationId: 'org-north', name: 'Omar' }),
);
db.drivers.insertOne({
  organizationId: 'org-north',
  name: 'Nora',
  licenseNumber: 'L-1',
});
tryWrite('same license, same org', () =>
  db.drivers.insertOne({
    organizationId: 'org-north',
    name: 'Hany',
    licenseNumber: 'L-1',
  }),
);
tryWrite('same license, other org', () =>
  db.drivers.insertOne({
    organizationId: 'org-south',
    name: 'Hany',
    licenseNumber: 'L-1',
  }),
);

section('2. One open work order per vehicle');
db.workOrders.drop();
db.workOrders.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
db.workOrders.insertOne({
  organizationId: 'org-north',
  vehicleId: 'v-101',
  status: 'open',
});
tryWrite('second open order', () =>
  db.workOrders.insertOne({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    status: 'open',
  }),
);
db.workOrders.updateOne(
  { vehicleId: 'v-101', status: 'open' },
  { $set: { status: 'closed' } },
);
tryWrite('open again after closing', () =>
  db.workOrders.insertOne({
    organizationId: 'org-north',
    vehicleId: 'v-101',
    status: 'open',
  }),
);
// Closing the order removes it from the index, so a new one can be opened.

section('3. 90-day retention and numeric timestamps');
print('  expireAfterSeconds:', 90 * 24 * 3600);
db.ttl_check.drop();
db.ttl_check.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 3600 },
);
db.ttl_check.insertOne({ timestamp: Date.now() - 200 * 24 * 3600 * 1000 }); // a number
db.adminCommand({ setParameter: 1, ttlMonitorSleepSecs: 1 });
sleep(3000);
db.adminCommand({ setParameter: 1, ttlMonitorSleepSecs: 60 });
print(
  '  200-day-old reading stored as a number, still there:',
  db.ttl_check.countDocuments(),
);
// A number is not a date, so the TTL index ignores it and the reading is kept
// forever. Catch it early by converting at the API boundary (DTO validation)
// and with schema validation on the collection ($jsonSchema, L7):
// timestamp must be bsonType 'date'.
db.ttl_check.drop();
