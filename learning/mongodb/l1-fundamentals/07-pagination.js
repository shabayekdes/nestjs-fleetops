// Learning Stage 1 — Exercise 07: pagination
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/07-pagination.js
//
// Concepts
// - Offset pagination: sort + skip(n) + limit(k). Simple, supports "jump to
//   page 37", but the server still walks past every skipped entry.
// - Range ("keyset" / "seek") pagination: remember the last sort key you saw
//   and ask for entries after it. Cost does not grow with the page number.
// - Pagination needs a stable, unique sort order. _id is unique and indexed.

load('/learning/l1-fundamentals/lib/library.js');

// 20 000 small documents, inserted in batches. _id is an increasing integer so
// the output is easy to read; the same idea works with ObjectIds.
db.events.drop();
const batch = [];
for (let i = 1; i <= 20000; i++) {
  batch.push({ _id: i, type: i % 3 === 0 ? 'return' : 'loan' });
  if (batch.length === 5000) db.events.insertMany(batch.splice(0));
}
print('events:', db.events.countDocuments());

function cost(cursor) {
  const s = cursor.explain('executionStats').executionStats;
  return (
    'keys examined: ' + s.totalKeysExamined + ', docs returned: ' + s.nReturned
  );
}
const pageSize = 10;

section('1. Offset pagination: page 3');
const page = 3;
const offsetPage = db.events
  .find()
  .sort({ _id: 1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize);
print(
  'ids:',
  offsetPage
    .toArray()
    .map((e) => e._id)
    .join(', '),
);

section('2. Range pagination: the page after the last _id seen');
let lastSeen = 20; // the last _id of page 2
const rangePage = db.events
  .find({ _id: { $gt: lastSeen } })
  .sort({ _id: 1 })
  .limit(pageSize);
print(
  'ids:',
  rangePage
    .toArray()
    .map((e) => e._id)
    .join(', '),
);

section('3. The cost of a deep page');
const deep = 1990; // page 1991: entries 19 901–19 910
print(
  'offset, page 1991:',
  cost(
    db.events
      .find()
      .sort({ _id: 1 })
      .skip(deep * pageSize)
      .limit(pageSize),
  ),
);
lastSeen = deep * pageSize;
print(
  'range,  page 1991:',
  cost(
    db.events
      .find({ _id: { $gt: lastSeen } })
      .sort({ _id: 1 })
      .limit(pageSize),
  ),
);
// Offset walks ~19 910 index keys to return 10 documents. Range walks ~10.
// The difference grows with the page number and the collection size —
// which is why telemetry history (millions of readings) uses range paging.

section('4. Offset pagination can skip or repeat items when data changes');
const page1 = db.events
  .find()
  .sort({ _id: 1 })
  .limit(pageSize)
  .toArray()
  .map((e) => e._id);
db.events.deleteOne({ _id: 1 }); // someone deletes an item on page 1
const page2 = db.events
  .find()
  .sort({ _id: 1 })
  .skip(pageSize)
  .limit(pageSize)
  .toArray()
  .map((e) => e._id);
print('page 1 was:', page1.join(', '));
print('page 2 is: ', page2.join(', '), '(11 was never shown)');
// Range pagination would ask for _id > 10 and get 11. FleetOps list endpoints
// use page/limit (offset), which is fine for small, human-sized lists.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/07-solutions.js)
//
// 1. Write a function rangePages(type, size) that prints every page of
//    events of the given type ('return'), using range pagination, and stops
//    when a page comes back empty. How many pages are there for size 1000?
// 2. Sort books by rating (descending). Rating is not unique, so the last
//    rating seen is not enough to find the next page. Which second sort key
//    makes it work, and what does the "after" filter look like?
// ---------------------------------------------------------------------------
