// Solutions — Exercise 01
load('/learning/l3-indexing/lib/telemetry.js');
print('readings:', seedReadings());

section('1. Readings above 115 km/h');
const fast = { speed: { $gt: 115 } };
const n = db.readings.countDocuments(fast);
print(
  '  matches:',
  n,
  '(' + ((n / db.readings.estimatedDocumentCount()) * 100).toFixed(1) + '%)',
);
report('no index', measure(db.readings.find(fast)));
db.readings.createIndex({ speed: 1 });
report('index on speed', measure(db.readings.find(fast)));
// 3.7% of the collection: selective enough that the index reads ~27× fewer
// documents. Worth it only if "fast readings across all vehicles" is a real
// access pattern, and in FleetOps it would need organizationId first anyway.
db.readings.dropIndexes();

section('2. Sort that the index cannot provide');
db.readings.createIndex({ vehicleId: 1 });
report(
  'v-101 newest 10',
  measure(
    db.readings.find({ vehicleId: 'v-101' }).sort({ timestamp: -1 }).limit(10),
  ),
);
// The SORT stage loads all 2 880 readings of v-101 and sorts them in memory
// to return 10. vehicleId_1 has the readings of v-101 in no particular time
// order. An index { vehicleId: 1, timestamp: -1 } removes the SORT (exercise 02).
db.readings.dropIndexes();

section('3. Counting');
db.readings.createIndex({ vehicleId: 1 });
const countPlan = db.readings
  .explain('executionStats')
  .count({ vehicleId: 'v-101' });
print('  count() with filter:', stageChain(winningPlan(countPlan)));
print(
  '  countDocuments():',
  db.readings.countDocuments({ vehicleId: 'v-101' }),
);
print('  estimatedDocumentCount():', db.readings.estimatedDocumentCount());
// count({ filter }) and countDocuments(filter) both use the index (COUNT_SCAN:
// only keys, no documents). estimatedDocumentCount() takes no filter at all:
// it reads the collection's metadata, so it is instant but counts everything.
// Prefer countDocuments(); cursor.count() is deprecated.
db.readings.dropIndexes();
