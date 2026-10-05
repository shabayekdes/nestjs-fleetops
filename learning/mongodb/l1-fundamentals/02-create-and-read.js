// Learning Stage 1 — Exercise 02: create and read
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/02-create-and-read.js
//
// Concepts
// - Databases and collections are created on first write. There is no
//   CREATE TABLE and no migration.
// - insertOne / insertMany return the _ids that were written.
// - _id is always unique: a duplicate _id is the one constraint every
//   collection has without you asking for it.
// - insertMany is "ordered" by default: it stops at the first error.
//   With { ordered: false } it tries every document and reports all errors.
// - find returns a cursor (lazy, batched); findOne returns one document or null.

load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. Collections appear on first write');
db.members.drop();
print('collections before:', db.getCollectionNames().includes('members'));
const res = db.members.insertOne({
  name: 'Mona',
  joined: ISODate('2026-01-10T00:00:00Z'),
});
print('collections after: ', db.getCollectionNames().includes('members'));
print(
  'acknowledged:',
  res.acknowledged,
  '| insertedId is an ObjectId:',
  res.insertedId instanceof ObjectId,
);

section('2. insertMany with your own _ids');
const many = db.members.insertMany([
  { _id: 'm-omar', name: 'Omar' },
  { _id: 'm-sara', name: 'Sara' },
]);
// _id does not have to be an ObjectId. Any unique value works.
printjson(many.insertedIds);

section('3. Duplicate _id — ordered insert stops at the first error');
try {
  db.members.insertMany([
    { _id: 'm-yara', name: 'Yara' },
    { _id: 'm-omar', name: 'Omar again' }, // duplicate
    { _id: 'm-ali', name: 'Ali' }, // never attempted
  ]);
} catch (e) {
  print('error code:', e.code, '(11000 = duplicate key)');
  print('inserted before the error:', e.result.insertedCount);
}
print('m-ali exists?', db.members.countDocuments({ _id: 'm-ali' }) === 1);

section(
  '4. Same insert, unordered: everything except the duplicate is written',
);
db.members.deleteMany({ _id: { $in: ['m-yara', 'm-ali'] } });
try {
  db.members.insertMany(
    [
      { _id: 'm-yara', name: 'Yara' },
      { _id: 'm-omar', name: 'Omar again' },
      { _id: 'm-ali', name: 'Ali' },
    ],
    { ordered: false },
  );
} catch (e) {
  print('inserted:', e.result.insertedCount, '| errors:', e.writeErrors.length);
}
print('m-ali exists?', db.members.countDocuments({ _id: 'm-ali' }) === 1);
// There is no transaction around insertMany: what was written stays written.
// Compare with Prisma createMany inside PostgreSQL, which is all-or-nothing.

section('5. Reading: findOne, find, countDocuments');
printjson(db.authors.findOne({ name: 'Naguib Mahfouz' }));
print('findOne with no match returns:', db.authors.findOne({ name: 'Nobody' }));
print('books in the library:', db.books.countDocuments());
print(
  'books by Pratchett:',
  db.books.countDocuments({ authorId: ids.pratchett }),
);

section('6. find returns a cursor');
const cursor = db.books.find({ authorId: ids.leGuin }, { _id: 0, title: 1 });
// Nothing is fetched until you iterate. toArray() loads everything into memory;
// forEach / for..of stream it batch by batch.
for (const b of cursor) print('  ', b.title);

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/02-solutions.js)
//
// 1. Insert three members in one call where the second one has a duplicate
//    _id ('m-sara'), so that the first and third are still written.
// 2. Print how many authors were born before 1930.
//    (hint: { born: { $lt: 1930 } } — operators are the topic of exercise 03)
// 3. Print the title of the one book whose `series` field exists, using
//    findOne. Why does `db.books.findOne({ series: { $exists: true } })` work
//    even though most books have no series field at all?
// ---------------------------------------------------------------------------
