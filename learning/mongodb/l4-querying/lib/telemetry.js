// Shared helpers for Learning Stage 4. Loaded by every exercise and solution
// with load('/learning/l4-querying/lib/telemetry.js').
//
// Synthetic telemetry: one document per reading in a plain collection (the
// operators are the same on a time series collection, but plain collections
// allow the updates this stage practises). Every document carries
// organizationId, and every query filters by it, as in FleetOps.

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

const START = ISODate('2026-10-05T06:00:00Z');
const VEHICLES = {
  'org-north': ['v-101', 'v-102', 'v-103', 'v-104', 'v-105'],
  'org-south': ['v-201', 'v-202'],
};

// Diagnostic trouble codes a device may report with a reading.
const CODES = ['P0300', 'P0420', 'P0171', 'P0128'];

// One reading: vehicle n, reading i (one per minute from START). Values are
// deterministic so output is stable between runs. Some readings are
// deliberately messy, as real device data is:
// - fuelLevel missing (sensor not reporting), null (reported "unknown"), or a
//   string (a firmware bug);
// - diagnostics: an array of { code, severity } on some readings.
function reading(organizationId, vehicleId, i) {
  const n = Number(vehicleId.slice(2));
  const doc = {
    organizationId,
    vehicleId,
    timestamp: new Date(START.getTime() + i * 60_000 + (n % 60) * 1000),
    speed: (i * 7 + n) % 131, // 0–130 km/h
    engine: { on: (i + n) % 12 !== 0, rpm: 800 + ((i * 37 + n) % 2600) },
  };
  if (doc.engine.on === false) doc.speed = 0;

  // Fuel: normally a number, sometimes missing / null / a string.
  const fuel = 90 - Math.floor(i / 10);
  if (n === 103 && i % 20 === 0) {
    // v-103's sensor drops out: no fuelLevel field at all.
  } else if (n === 104 && i % 30 === 0) {
    doc.fuelLevel = null;
  } else if (n === 105 && i % 45 === 0) {
    doc.fuelLevel = String(fuel);
  } else {
    doc.fuelLevel = fuel;
  }

  // Diagnostics on about one reading in 8.
  if ((i + n) % 8 === 0) {
    const k = Math.floor((i + n) / 8);
    const a = CODES[k % CODES.length];
    const b = CODES[(k + 1) % CODES.length];
    doc.diagnostics =
      i % 3 === 0
        ? [
            { code: a, severity: 'high' },
            { code: b, severity: 'low' },
          ]
        : [{ code: a, severity: i % 2 ? 'low' : 'medium' }];
  }
  return doc;
}

// Drops and reloads `readings`: 7 vehicles × 6 hours = 2 520 readings, with
// the ESR index from L3.
function seedReadings() {
  db.readings.drop();
  const docs = [];
  for (const [organizationId, vehicleIds] of Object.entries(VEHICLES)) {
    for (const vehicleId of vehicleIds) {
      for (let i = 0; i < 6 * 60; i++) {
        docs.push(reading(organizationId, vehicleId, i));
      }
    }
  }
  db.readings.insertMany(docs);
  db.readings.createIndex({ organizationId: 1, vehicleId: 1, timestamp: -1 });
  return db.readings.countDocuments();
}

// The plan and work of a find() cursor, in one line (see L3).
function cost(cursor) {
  const e = cursor.explain('executionStats');
  const wp = e.queryPlanner.winningPlan;
  const names = [];
  let s = wp.queryPlan ?? wp;
  while (s) {
    names.push(s.stage);
    s = s.inputStage ?? (s.inputStages ? s.inputStages[0] : undefined);
  }
  const x = e.executionStats;
  return (
    names.join(' > ') +
    ' | keys ' +
    x.totalKeysExamined +
    ' | docs ' +
    x.totalDocsExamined +
    ' | returned ' +
    x.nReturned
  );
}

// Runs fn and prints either 'ok' with its result or the error.
function attempt(label, fn) {
  try {
    const r = fn();
    print('  ' + label + ': ok', r === undefined ? '' : JSON.stringify(r));
  } catch (e) {
    print(
      '  ' +
        label +
        ': ' +
        e.name +
        ' ' +
        e.code +
        ' ' +
        (e.errmsg ?? e.message).split(' dup key')[0],
    );
  }
}
