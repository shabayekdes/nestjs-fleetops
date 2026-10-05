// Learning Stage 1 — Exercise 04: updates
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/04-update.js
//
// Concepts
// - updateOne / updateMany take a filter and an update document made of
//   operators: $set, $unset, $inc, $push, $pull, $addToSet, …
// - The result says how many documents matched and how many actually changed.
// - A single-document update is atomic: concurrent $inc calls never lose a
//   write, without any transaction.
// - replaceOne swaps the whole document. Forgetting a field there deletes it.
// - findOneAndUpdate returns the document before or after the change.

load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

function showBook(n, fields) {
  printjson(db.books.findOne({ _id: book(n) }, { _id: 0, ...fields }));
}

section('1. $set: change a field, add a nested field');
// SQL: UPDATE books SET rating = 4.7 WHERE _id = …
let r = db.books.updateOne(
  { _id: book(7) },
  { $set: { rating: 4.7, 'publisher.city': 'London' } },
);
print('matched:', r.matchedCount, '| modified:', r.modifiedCount);
showBook(7, { title: 1, rating: 1, publisher: 1 });

section('2. matched vs modified');
r = db.books.updateOne({ _id: book(7) }, { $set: { rating: 4.7 } });
// The document matched, but the value was already 4.7, so nothing changed.
print('matched:', r.matchedCount, '| modified:', r.modifiedCount);

section('3. $inc: atomic counters');
// SQL: UPDATE books SET copies = copies - 1 WHERE …
// Read-modify-write in application code (read copies, subtract, $set) can lose
// updates when two requests run at once. $inc is applied by the server.
db.books.updateOne({ _id: book(1) }, { $inc: { copies: -1 } });
showBook(1, { title: 1, copies: 1 });

section('4. Arrays: $push, $addToSet, $pull');
db.books.updateOne({ _id: book(1) }, { $push: { genres: 'coming-of-age' } });
db.books.updateOne({ _id: book(1) }, { $addToSet: { genres: 'fantasy' } }); // already there: no-op
db.books.updateOne({ _id: book(1) }, { $push: { genres: 'fantasy' } }); //    $push duplicates
showBook(1, { genres: 1 });
db.books.updateOne({ _id: book(1) }, { $pull: { genres: 'fantasy' } }); //    removes every match
showBook(1, { genres: 1 });

section('5. $unset: remove a field');
db.books.updateOne({ _id: book(12) }, { $unset: { series: '' } });
showBook(12, { title: 1, series: 1 });

section('6. updateMany');
// Mark every book with no copies left.
r = db.books.updateMany({ copies: 0 }, { $set: { status: 'waitlist' } });
print('matched:', r.matchedCount, '| modified:', r.modifiedCount);
db.books
  .find({ status: 'waitlist' }, { _id: 0, title: 1 })
  .forEach((d) => print('  ', d.title));

section('7. Pitfall: replaceOne drops every field you leave out');
db.books.replaceOne({ _id: book(11) }, { title: 'Americanah', rating: 4.4 });
showBook(11, {});
// authorId, year, genres, publisher… are gone. Use $set unless you really mean
// "this is the whole new document". (Prisma `update` is always a partial update.)

section('8. findOneAndUpdate: get the document back');
const after = db.books.findOneAndUpdate(
  { _id: book(3) },
  { $inc: { copies: 1 } },
  { returnDocument: 'after', projection: { _id: 0, title: 1, copies: 1 } },
);
printjson(after);

section('9. Upsert: update, or insert when nothing matches');
r = db.authors.updateOne(
  { name: 'Ken Liu' },
  { $set: { country: 'US' }, $setOnInsert: { born: 1976 } },
  { upsert: true },
);
print('matched:', r.matchedCount, '| upsertedId set:', r.upsertedId !== null);
printjson(db.authors.findOne({ name: 'Ken Liu' }, { _id: 0 }));
// (L4 goes deeper into upserts; they matter for "latest position per vehicle".)

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/04-solutions.js)
//
// 1. Add the genre 'classic' to every book published before 1960, without
//    creating duplicates if you run it twice.
// 2. Lend a copy of 'Small Gods': decrease copies by 1, but only if at least
//    one copy is available. Run it three times — what happens on the third?
//    (hint: put the condition in the filter, not in application code)
// 3. Rename the field `pages` to `pageCount` in every book. (hint: $rename)
// ---------------------------------------------------------------------------
