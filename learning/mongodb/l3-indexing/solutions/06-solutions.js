// Solutions — Exercise 06. Task 2 uses ts_seconds: run exercise 06 first.
load('/learning/l3-indexing/lib/telemetry.js');

function measureTs(cursor) {
  const e = cursor.explain('executionStats');
  const inner = e.stages[0].$cursor;
  const s = inner.executionStats;
  return {
    plan: stageChain(winningPlan(inner)),
    index: indexUsed(winningPlan(inner)),
    keysExamined: s.totalKeysExamined,
    docsExamined: s.totalDocsExamined,
    returned: s.nReturned,
    ms: s.executionTimeMillis,
  };
}

section('1. Readings every 10 s');
// granularity 'seconds' → buckets span up to 1 hour → 360 readings per bucket
// (under the 1 000 cap). 'minutes' would cap at 1 000 readings (~2.8 h).
db.ts_custom.drop();
db.createCollection('ts_custom', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'meta',
    bucketMaxSpanSeconds: 6 * 3600,
    bucketRoundingSeconds: 6 * 3600,
  },
});
print(
  '  options:',
  JSON.stringify(
    db.getCollectionInfos({ name: 'ts_custom' })[0].options.timeseries,
  ),
);
// Custom spans (both values must be equal) fit buckets to the access pattern:
// longer spans mean fewer, better-compressed buckets but more readings
// unpacked for a short query; shorter spans the opposite.
db.ts_custom.drop();

section('2. Fast readings for v-101 on 5 Oct');
const q = {
  'meta.organizationId': 'org-north',
  'meta.vehicleId': 'v-101',
  timestamp: {
    $gte: ISODate('2026-10-05T00:00:00Z'),
    $lt: ISODate('2026-10-06T00:00:00Z'),
  },
  speed: { $gt: 110 },
};
report('speed > 110, one day', measureTs(db.ts_seconds.find(q)));
print('  readings returned:', db.ts_seconds.countDocuments(q));
// 24 buckets (one per hour) are fetched. MongoDB also adds a bucket filter on
// control.max.speed > 110: a bucket whose fastest reading is 110 or less is
// skipped without unpacking. In this data every hour has a reading above 110,
// so nothing is skipped; with real driving data (fast only on highways) many
// buckets would be.

section('3. organizationId as a measurement instead of meta');
db.ts_wrong.drop();
db.createCollection('ts_wrong', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'vehicleId',
    granularity: 'seconds',
  },
});
forEachBatch((b) => db.ts_wrong.insertMany(b, { ordered: false }));
report(
  'R1 with org as a measurement',
  measureTs(
    db.ts_wrong.find({
      organizationId: 'org-north',
      vehicleId: 'v-101',
      timestamp: {
        $gte: ISODate('2026-10-05T08:00:00Z'),
        $lt: ISODate('2026-10-05T09:00:00Z'),
      },
    }),
  ),
);
// The automatic { vehicleId: 1, timestamp: 1 } index serves it (meta is a
// plain value now, so the auto index matches it). It works, but:
// - organizationId is stored in every reading instead of once per bucket;
// - the index cannot start with organizationId, so an organization-wide query
//   ("all of org-north's readings this hour") cannot use an index prefix;
// - vehicleIds are only unique per tenant in FleetOps (UUIDs make clashes
//   unlikely, but the model should not depend on it): two tenants' vehicles
//   with the same id would share buckets.
// Tenant identity belongs in meta, and indexes start with meta.organizationId.
db.ts_wrong.drop();
