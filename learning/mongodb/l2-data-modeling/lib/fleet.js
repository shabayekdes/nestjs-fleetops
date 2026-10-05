// Shared helpers for Learning Stage 2. Loaded by every exercise and solution
// with load('/learning/l2-data-modeling/lib/fleet.js').
//
// The data set is FleetOps-like, but it is NOT the FleetOps schema: the point
// of L2 is to see how the same domain could be modeled as documents.
// Every document carries organizationId, as tenant data does in FleetOps.

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

// Size helper. Use the global bsonsize(doc) for the BSON size of one document
// (mongosh 2.x has no Object.bsonsize).
function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// Storage numbers for a whole collection (uncompressed data size).
function collectionStats(name) {
  const s = db
    .getCollection(name)
    .aggregate([{ $collStats: { storageStats: {} } }])
    .toArray()[0].storageStats;
  return { count: s.count, size: s.size, avgObjSize: s.avgObjSize ?? 0 };
}

// One synthetic telemetry reading. Values are deterministic so output is
// stable between runs: vehicle n, reading i (every 10 seconds from `start`).
function reading(vehicleId, start, i) {
  const n = Number(vehicleId.slice(2)) || 0;
  return {
    timestamp: new Date(start.getTime() + i * 10_000),
    // Each vehicle-hour gets its own top speed (70–120) so summaries differ.
    speed: (i * 7 + n) % (70 + ((n + Math.floor(i / 360)) % 6) * 10),
    fuelLevel: 80 - Math.floor(i / 120),
    engineOn: i % 50 !== 0,
    location: {
      type: 'Point',
      coordinates: [31.2 + (i % 100) / 1000, 30.0 + (i % 60) / 1000],
    },
  };
}

// Drops and recreates the core FleetOps-like collections used by 01 and 03.
function seedFleet() {
  ['organizations', 'vehicles', 'drivers', 'assignments'].forEach((c) =>
    db.getCollection(c).drop(),
  );

  db.organizations.insertMany([
    { _id: 'org-north', name: 'North Fleet', region: 'Cairo' },
    { _id: 'org-south', name: 'South Fleet', region: 'Aswan' },
  ]);

  db.drivers.insertMany([
    { _id: 'd-1', organizationId: 'org-north', name: 'Mona', status: 'active' },
    {
      _id: 'd-2',
      organizationId: 'org-north',
      name: 'Omar',
      status: 'off-duty',
    },
    { _id: 'd-3', organizationId: 'org-north', name: 'Nora', status: 'active' },
    { _id: 'd-9', organizationId: 'org-south', name: 'Hany', status: 'active' },
  ]);

  db.vehicles.insertMany([
    {
      _id: 'v-101',
      organizationId: 'org-north',
      plate: 'ABC-123',
      status: 'active',
      // One-to-one data embedded: it belongs to this vehicle only, is always
      // read with it and never queried on its own.
      registration: {
        vin: '1HGCM82633A004352',
        make: 'Toyota',
        model: 'Hilux',
        year: 2022,
      },
    },
    {
      _id: 'v-102',
      organizationId: 'org-north',
      plate: 'ABC-124',
      status: 'maintenance',
      registration: {
        vin: '2T1BURHE0JC074321',
        make: 'Isuzu',
        model: 'NPR',
        year: 2020,
      },
    },
    {
      _id: 'v-103',
      organizationId: 'org-north',
      plate: 'ABC-125',
      status: 'idle',
      registration: {
        vin: '3VWFE21C04M000001',
        make: 'Toyota',
        model: 'Hiace',
        year: 2021,
      },
    },
    {
      _id: 'v-901',
      organizationId: 'org-south',
      plate: 'XYZ-900',
      status: 'active',
      registration: {
        vin: '5YJSA1E26HF000002',
        make: 'Ford',
        model: 'Transit',
        year: 2023,
      },
    },
  ]);
}
