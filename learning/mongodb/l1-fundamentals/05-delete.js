// Learning Stage 1 — Exercise 05: deletes, and the lack of foreign keys
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/05-delete.js
//
// Concepts
// - deleteOne removes the first match, deleteMany every match.
// - deleteMany({}) empties a collection (drop() removes it with its indexes).
// - MongoDB has no foreign keys. Deleting a document does not check, cascade
//   or restrict anything that refers to it. That is the application's job.

load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. deleteOne vs deleteMany');
let r = db.books.deleteOne({ authorId: ids.mahfouz });
print('deleteOne removed:', r.deletedCount);
r = db.books.deleteMany({ authorId: ids.mahfouz });
print('deleteMany removed the rest:', r.deletedCount);
// deleteOne with a filter that matches several documents removes one of them,
// with no guarantee which. Delete by _id when you mean one specific document.

section('2. No foreign keys: orphans are allowed');
r = db.authors.deleteOne({ _id: ids.asimov });
print('author deleted:', r.deletedCount);
const orphan = db.books.findOne(
  { authorId: ids.asimov },
  { _id: 0, title: 1, authorId: 1 },
);
print('book still pointing at the deleted author:');
printjson(orphan);
// In FleetOps, foreign keys use onDelete: Restrict, so PostgreSQL would have
// refused to delete a vehicle that still has fuel logs. Here the database
// accepted it. If you need that rule in MongoDB, you check it in code (or you
// model the data so the rule is not needed — the topic of L2).

section('3. Checking the rule in code (and why it is not enough)');
function deleteAuthorIfNoBooks(authorId) {
  if (db.books.countDocuments({ authorId }) > 0) {
    return 'refused: author still has books';
  }
  return 'deleted: ' + db.authors.deleteOne({ _id: authorId }).deletedCount;
}
print(deleteAuthorIfNoBooks(ids.pratchett));
// Race: a book could be inserted between the count and the delete. A foreign
// key closes that gap; this check does not (multi-document transactions can,
// with a replica set — L14).

section('4. Soft delete');
// Many systems mark documents instead of deleting them.
db.books.updateOne({ _id: book(9) }, { $set: { deletedAt: new Date() } });
const active = { deletedAt: { $exists: false } };
print(
  'active books:',
  db.books.countDocuments(active),
  'of',
  db.books.countDocuments(),
);
// Every read must now remember the extra filter — the same trade-off as in SQL.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/05-solutions.js)
//
// 1. Delete every book that has 0 copies AND was published before 2000.
//    Print how many were deleted.
// 2. Find all orphaned books: books whose authorId does not match any author.
//    (hint: first collect the existing author _ids, then use $nin)
// ---------------------------------------------------------------------------
