// Learning Stage 3 — Exercise 01: explain(), COLLSCAN vs IXSCAN, selectivity
//
// Run: docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/01-explain-basics.js
//
// Concepts
// - Without a suitable index, MongoDB reads every document in the collection
//   (COLLSCAN) and keeps the ones that match.
// - An index is a sorted list of (key → document location). With one, MongoDB
//   walks only the matching range of keys (IXSCAN) and then loads those
//   documents (FETCH).
// - explain() shows what the query planner chose:
//     explain('queryPlanner')       the chosen plan, without running it
//     explain('executionStats')     runs it and counts the work done
//     explain('allPlansExecution')  also the work done by rejected plans
// - The three numbers to read: totalKeysExamined, totalDocsExamined, nReturned.
//   In the ideal plan all three are equal. Every key or document examined but
//   not returned is wasted work.
// - Selectivity: how small a fraction of the collection a value matches. An
//   index on a field with few distinct values (a boolean, a status) narrows
//   little, so it saves little.

load('/learning/l3-indexing/lib/telemetry.js');

section('0. Data');
print('readings:', seedReadings());
print('sample:', db.readings.findOne({}, { _id: 0, location: 0 }));
// 3 organizations, 50 vehicles, one reading per minute for two days.

// The query this exercise follows: one vehicle's readings for one hour.
const oneHour = {
  organizationId: 'org-north',
  vehicleId: 'v-101',
  timestamp: {
    $gte: ISODate('2026-10-05T08:00:00Z'),
    $lt: ISODate('2026-10-05T09:00:00Z'),
  },
};

section('1. No index: COLLSCAN');
print(
  'indexes:',
  db.readings.getIndexes().map((i) => i.name),
);
report('one vehicle, one hour', measure(db.readings.find(oneHour)));
// 60 documents returned, 144 000 examined: the whole collection is read for
// every query, and the cost grows with the collection, not with the result.

section('2. Reading the raw explain output');
const qp = db.readings.find(oneHour).explain('queryPlanner').queryPlanner;
print('namespace:', qp.namespace);
print('parsed filter:', JSON.stringify(qp.parsedQuery));
print('winning plan:', stageChain(winningPlan({ queryPlanner: qp })));
print('rejected plans:', qp.rejectedPlans.length);
// 'queryPlanner' does not run the query, so it is safe on a slow query in
// production. It cannot tell you how much work was done; 'executionStats' can.

section('3. A single-field index on vehicleId');
db.readings.createIndex({ vehicleId: 1 });
report('one vehicle, one hour', measure(db.readings.find(oneHour)));
// IXSCAN on vehicleId_1 finds the 2 880 readings of v-101, FETCH loads all of
// them and then throws away those outside the hour. Much better than 144 000,
// but 2 880 examined for 60 returned: the index answers only part of the
// question. Exercise 02 fixes this with a compound index.

section('4. Selectivity: which field deserves an index?');
// Count how many documents each kind of value matches.
const total = db.readings.estimatedDocumentCount();
[
  ['vehicleId: v-101', { vehicleId: 'v-101' }],
  ['organizationId: org-east', { organizationId: 'org-east' }],
  ['organizationId: org-north', { organizationId: 'org-north' }],
  ['engineOn: true', { engineOn: true }],
  ['engineOn: false', { engineOn: false }],
].forEach(([label, filter]) => {
  const n = db.readings.countDocuments(filter);
  print(
    '  ' + label.padEnd(26),
    String(n).padStart(6),
    '(' + ((n / total) * 100).toFixed(1) + '%)',
  );
});
// vehicleId is very selective (2%). engineOn: true matches 90% of the
// collection, so an index on it would hardly narrow anything. The same field
// can be selective for one value (engineOn: false, 10%) and useless for the
// other. organizationId alone is weak for big tenants (60% for org-north).

section('5. A low-selectivity index can be slower than no index');
db.readings.createIndex({ engineOn: 1 });
const engineOnQuery = () => db.readings.find({ engineOn: true });
report('engineOn: true (index)', measure(engineOnQuery()));
report(
  'engineOn: true (forced COLLSCAN)',
  measure(engineOnQuery().hint({ $natural: 1 })),
);
// hint() overrides the planner; { $natural: 1 } forces a collection scan.
// With the index, MongoDB examines 129 600 keys AND loads 129 600 documents
// in index order (random places on disk). The collection scan reads the same
// documents in storage order with no index work. Compare the times on your
// machine: the index buys nothing here. (The planner still picked it, because
// with only one candidate plan there is nothing to compare it against.)
db.readings.dropIndex('engineOn_1');

section('6. An index the query cannot use');
report(
  'one hour, all vehicles',
  measure(
    db.readings.find({
      timestamp: {
        $gte: ISODate('2026-10-05T08:00:00Z'),
        $lt: ISODate('2026-10-05T09:00:00Z'),
      },
    }),
  ),
);
// An index on vehicleId cannot help a filter on timestamp alone: the index is
// sorted by vehicleId, so readings of one hour are spread through all of it.

section('7. Two candidate indexes: the planner races them');
db.readings.createIndex({ timestamp: 1 });
const raced = db.readings.find(oneHour).explain('allPlansExecution');
print('winning:', indexUsed(winningPlan(raced)));
raced.queryPlanner.rejectedPlans.forEach((p) =>
  print('rejected:', indexUsed(p.queryPlan ?? p)),
);
report('one vehicle, one hour', measure(db.readings.find(oneHour)));
// With more than one usable index, MongoDB runs each candidate for a short
// trial and keeps the one that produced results with the least work. The
// winner is cached for this query shape until the indexes or the data change
// enough. Here timestamp_1 (3 000 readings in the hour, from all 50 vehicles)
// and vehicleId_1 (2 880 readings of v-101) are close; neither is good.

// Clean up so the next run starts from the same state.
db.readings.dropIndexes();

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. Find the readings above 115 km/h. Measure it without an index, then with
//    an index on speed. What fraction of the collection matches? Is the index
//    worth having for this query?
// 2. With only { vehicleId: 1 } indexed, measure a query for v-101 sorted by
//    timestamp (newest first, limit 10). Find the SORT stage in the plan.
//    What does it cost, and why can the index not avoid it?
// 3. db.readings.find({ vehicleId: 'v-101' }).count() vs
//    db.readings.countDocuments({ vehicleId: 'v-101' }) vs
//    db.readings.estimatedDocumentCount(): which ones can use the index, and
//    which one ignores the filter entirely?
// ---------------------------------------------------------------------------
