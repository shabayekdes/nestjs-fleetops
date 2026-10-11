// Learning Stage 5 — Exercise 01: pipeline basics
//
// Run: docker compose exec mongo mongosh --quiet learning_l5 /learning/l5-aggregation/01-pipeline-basics.js
//
// Concepts
// - An aggregation is a list of stages. Each stage takes the documents the
//   previous stage produced and passes new documents on, like a Unix pipe.
// - $match filters, $project / $set reshape, $group combines many documents
//   into one per group key, $sort / $limit / $skip order and cut.
// - $group accumulators: $sum, $avg, $min, $max, $first, $last, $push,
//   $addToSet, $count. _id is the group key (null = one group for everything).
// - Only the FIRST stages can use an index: a $match (and $sort) at the start
//   of the pipeline is run as an index query. Once a $group has run, the
//   documents are new and have no index.
// - The summary is computed where the data is: one small result crosses the
//   network instead of thousands of readings.
//
// Access patterns:
//   A1  readings per vehicle (data coverage)
//   A2  average, min and max speed per vehicle while driving
//   A3  the fastest vehicles of an organization (top N)

load('/learning/l5-aggregation/lib/telemetry.js');
print('readings:', seed());
const org = 'org-north';

section('1. A1: readings per vehicle');
show(
  db.readings.aggregate([
    { $match: { organizationId: org } },
    { $group: { _id: '$vehicleId', readings: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]),
);
// $match first: only org-north readings enter the pipeline (tenant isolation
// is a $match stage, exactly as it is a WHERE clause in SQL).
// SQL: SELECT vehicle_id, COUNT(*) FROM readings WHERE organization_id = …
//      GROUP BY vehicle_id ORDER BY vehicle_id

section('2. A2: speed statistics while driving');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, speed: { $gt: 0 } } },
    {
      $group: {
        _id: '$vehicleId',
        avgSpeed: { $avg: '$speed' },
        minSpeed: { $min: '$speed' },
        maxSpeed: { $max: '$speed' },
        drivingMinutes: { $sum: 1 },
      },
    },
    { $set: { avgSpeed: round('$avgSpeed') } },
    { $sort: { avgSpeed: -1 } },
  ]),
);
// speed > 0 is part of the question: an average that includes parked
// minutes answers "how fast on average over the whole day", a different
// question. Decide what an average means before computing it.

section('3. $project vs $set');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, vehicleId: 'v-101' } },
    { $sort: { timestamp: -1 } },
    { $limit: 2 },
    { $project: { _id: 0, timestamp: 1, speed: 1 } },
  ]),
);
show(
  db.readings.aggregate([
    { $match: { organizationId: org, vehicleId: 'v-101' } },
    { $sort: { timestamp: -1 } },
    { $limit: 2 },
    { $set: { speedMs: round({ $divide: ['$speed', 3.6] }) } },
    { $unset: ['_id', 'organizationId'] },
  ]),
);
// $project keeps only what you list. $set ($addFields) adds or replaces fields
// and keeps the rest. $unset removes fields.

section('4. Accumulators that keep values: $push, $addToSet, $first, $last');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, diagnostics: { $exists: true } } },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: '$vehicleId',
        firstCodeAt: { $first: '$timestamp' },
        lastCodeAt: { $last: '$timestamp' },
        readingsWithCodes: { $sum: 1 },
        days: {
          $addToSet: {
            $dateToString: { date: '$timestamp', format: '%Y-%m-%d' },
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]),
);
// $first / $last depend on the order of the documents entering $group: sort
// first, or they are meaningless. $push collects every value into an array
// (careful: a group's result is one document, limited to 16 MB). $addToSet
// keeps distinct values only, in no particular order.

section('5. Stage order and index use');
function plan(pipeline) {
  const e = db.readings.explain('executionStats').aggregate(pipeline);
  // When the whole pipeline runs inside the query engine there is no
  // `stages` array; otherwise the index part is in stages[0].$cursor.
  const q = e.stages ? e.stages[0].$cursor : e;
  const after = e.stages
    ? e.stages.slice(1).map((st) => Object.keys(st)[0])
    : [];
  return (
    'docs examined ' +
    String(q.executionStats.totalDocsExamined).padStart(5) +
    ' | then: ' +
    (after.join(', ') || '(none)')
  );
}
print(
  '  $match first:                   ',
  plan([
    { $match: { organizationId: 'org-south' } },
    { $group: { _id: '$vehicleId', maxSpeed: { $max: '$speed' } } },
  ]),
);
print(
  '  $match on the group key after: ',
  plan([
    { $group: { _id: { org: '$organizationId', v: '$vehicleId' }, maxSpeed: { $max: '$speed' } } },
    { $match: { '_id.org': 'org-south' } },
  ]),
); // prettier-ignore
print(
  '  $match on an accumulator after:',
  plan([
    { $group: { _id: '$vehicleId', org: { $first: '$organizationId' }, maxSpeed: { $max: '$speed' } } },
    { $match: { org: 'org-south' } },
  ]),
); // prettier-ignore
// The optimizer rewrote the second pipeline: a $match on the group key can be
// moved before the $group, so it ran like the first one (no $match stage left).
// In the third, `org` is computed by an accumulator, so the optimizer cannot
// move the filter: every tenant's 25 920 readings are grouped, and most groups
// are thrown away. The result is the same; the work is 3× more.
// Do not rely on the optimizer: write the tenant $match as the first stage.

section('6. A3: top N with $sort + $limit');
show(
  db.readings.aggregate([
    { $match: { organizationId: org } },
    { $group: { _id: '$vehicleId', maxSpeed: { $max: '$speed' } } },
    { $sort: { maxSpeed: -1, _id: 1 } },
    { $limit: 2 },
  ]),
);
// $sort followed by $limit is merged into a top-N sort that keeps only N
// documents in memory. The _id tie-breaker makes the order deterministic when
// two vehicles have the same maximum.

section('7. Counting and paging the result');
show(
  db.readings.aggregate([
    { $match: { organizationId: org, diagnostics: { $exists: true } } },
    { $count: 'readingsWithDiagnostics' },
  ]),
);
show(
  db.readings.aggregate([
    { $match: { organizationId: org, speed: { $gte: 99 } } },
    { $sort: { timestamp: -1 } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        page2: [
          { $skip: 5 },
          { $limit: 3 },
          { $project: { _id: 0, vehicleId: 1, timestamp: 1, speed: 1 } },
        ],
      },
    },
  ]),
);
// $facet runs several sub-pipelines on the same input: here the total for the
// pager and one page of rows, in one round trip. $skip has the same cost as in
// L1: deep pages still walk past every skipped document.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. For org-south: per vehicle, the number of minutes with the engine on and
//    the number with the engine off. One $group, using $cond inside $sum.
// 2. Per vehicle type (van / truck) in org-north: the average driving speed.
//    The type is not in the readings: how far can you get without $lookup
//    (exercise 04)? Hint: $in with a list of vehicle ids.
// 3. Which vehicle of org-north had the lowest fuel level ever recorded, and
//    when? Use $sort + $group with $first, then explain why $min alone cannot
//    tell you the time.
// ---------------------------------------------------------------------------
