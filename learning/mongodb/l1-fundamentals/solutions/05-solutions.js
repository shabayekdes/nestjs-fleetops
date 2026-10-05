// Solutions — Exercise 05
load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. No copies and published before 2000');
print(
  'deleted:',
  db.books.deleteMany({ copies: 0, year: { $lt: 2000 } }).deletedCount,
);

section('2. Orphaned books');
db.authors.deleteOne({ _id: ids.asimov }); // create an orphan first
const authorIds = db.authors.distinct('_id');
db.books
  .find({ authorId: { $nin: authorIds } }, { _id: 0, title: 1 })
  .forEach((b) => print('  ', b.title));
// This reads every author id into memory: fine for 5 authors, not for millions.
// L5 does the same with $lookup inside the database.
