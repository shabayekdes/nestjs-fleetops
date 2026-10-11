// Shared helpers for Learning Stage 3. Loaded by every exercise and solution
// with load('/learning/l3-indexing/lib/telemetry.js').
//
// The data set is synthetic telemetry: one document per reading, the shape L2
// started from. Every document carries organizationId, as tenant data does in
// FleetOps. Values are deterministic so output is stable between runs.

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Three tenants of very different sizes, so selectivity differs per tenant.
const ORGS = [
  { id: 'org-north', firstVehicle: 101, vehicles: 30 },
  { id: 'org-south', firstVehicle: 201, vehicles: 15 },
  { id: 'org-east', firstVehicle: 301, vehicles: 5 },
];
const START = ISODate('2026-10-05T00:00:00Z');
const READINGS_PER_VEHICLE = 2 * 24 * 60; // two days, one reading per minute

function vehiclesOf(org) {
  return Array.from(
    { length: org.vehicles },
    (_, k) => 'v-' + (org.firstVehicle + k),
  );
}

// One reading: vehicle n, reading i (one per minute from START).
function reading(organizationId, vehicleId, i) {
  const n = Number(vehicleId.slice(2));
  const engineOn = (i + n) % 10 !== 0; // about 10% of readings: engine off
  return {
    organizationId,
    vehicleId,
    // Devices do not report in sync: each vehicle is offset by a few seconds,
    // so no two vehicles share a timestamp (as with real devices).
    timestamp: new Date(START.getTime() + i * 60_000 + (n % 60) * 1000),
    speed: engineOn ? (i * 7 + n) % 121 : 0, // 0–120 km/h
    fuelLevel: 100 - Math.floor((i % 1440) / 20), // refuelled once a day
    engineOn,
    location: {
      type: 'Point',
      coordinates: [31.2 + ((i + n) % 100) / 1000, 30.0 + (i % 60) / 1000],
    },
  };
}

// Calls fn(batch) with batches of readings for every vehicle of every org.
// 50 vehicles × 2 880 readings = 144 000 readings in total.
function forEachBatch(fn, batchSize = 10_000) {
  let batch = [];
  for (const org of ORGS) {
    for (const vehicleId of vehiclesOf(org)) {
      for (let i = 0; i < READINGS_PER_VEHICLE; i++) {
        batch.push(reading(org.id, vehicleId, i));
        if (batch.length === batchSize) fn(batch.splice(0));
      }
    }
  }
  if (batch.length) fn(batch);
}

// Drops and reloads a plain collection of readings (only the _id index).
function seedReadings(name = 'readings') {
  const coll = db.getCollection(name);
  coll.drop();
  forEachBatch((batch) => coll.insertMany(batch, { ordered: false }));
  return coll.countDocuments();
}

// ---------------------------------------------------------------------------
// explain() helpers
// ---------------------------------------------------------------------------

// The plan tree. On 7.0 a query run by the slot-based engine nests the classic
// tree under `queryPlan`; older plans have it directly.
function winningPlan(explained) {
  const wp = explained.queryPlanner.winningPlan;
  return wp.queryPlan ?? wp;
}

// Stage names from the top of the tree down: e.g. "FETCH > IXSCAN".
function stageChain(stage) {
  const names = [];
  let s = stage;
  while (s) {
    names.push(s.stage);
    s = s.inputStage ?? (s.inputStages ? s.inputStages[0] : undefined);
  }
  return names.join(' > ');
}

function indexUsed(stage) {
  let s = stage;
  while (s) {
    if (s.indexName) return s.indexName;
    s = s.inputStage ?? (s.inputStages ? s.inputStages[0] : undefined);
  }
  return '(none)';
}

// Runs the cursor with explain('executionStats') and returns the numbers that
// matter. Works for find() cursors on plain collections.
function measure(cursor) {
  const e = cursor.explain('executionStats');
  const plan = winningPlan(e);
  const s = e.executionStats;
  return {
    plan: stageChain(plan),
    index: indexUsed(plan),
    keysExamined: s.totalKeysExamined,
    docsExamined: s.totalDocsExamined,
    returned: s.nReturned,
    ms: s.executionTimeMillis,
  };
}

// One line per measurement, aligned for comparing.
function report(label, m) {
  print(
    '  ' + label.padEnd(34),
    m.plan.padEnd(36),
    'keys',
    String(m.keysExamined).padStart(6),
    '| docs',
    String(m.docsExamined).padStart(6),
    '| returned',
    String(m.returned).padStart(5),
    '|',
    String(m.ms).padStart(4),
    'ms | index',
    m.index,
  );
}

// Storage numbers for a whole collection. storageSize is the compressed size
// on disk; size is uncompressed. Index sizes are on disk.
function storage(name) {
  // Sizes are only up to date after a checkpoint; fsync forces one.
  db.adminCommand({ fsync: 1 });
  const s = db
    .getCollection(name)
    .aggregate([{ $collStats: { storageStats: {} } }])
    .toArray()[0].storageStats;
  return {
    count: s.count,
    size: s.size,
    storageSize: s.storageSize,
    totalIndexSize: s.totalIndexSize,
    indexSizes: s.indexSizes,
  };
}
