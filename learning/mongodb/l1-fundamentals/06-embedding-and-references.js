// Learning Stage 1 — Exercise 06: embedded documents, arrays and references
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/06-embedding-and-references.js
//
// Concepts (an introduction; L2 is about choosing between them)
// - Embedding: related data lives inside the document (book.publisher).
//   One read gets everything; one write updates it atomically.
// - Referencing: the document stores another document's _id (book.authorId).
//   Getting both needs two queries (or $lookup, in L5).
// - Embedding copies data. If the copy changes, every copy must be updated.

load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. Embedded: one read returns the book and its publisher');
printjson(
  db.books.findOne({ title: 'Small Gods' }, { _id: 0, title: 1, publisher: 1 }),
);

section('2. Referenced: book → author needs a second query');
const b = db.books.findOne({ title: 'Americanah' });
const author = db.authors.findOne({ _id: b.authorId }, { _id: 0, name: 1 });
print(b.title, 'by', author.name);

section('3. "Join" in the application: books with author names');
// Avoid one query per book (the N+1 problem): fetch all needed authors at once.
const books = db.books
  .find({ genres: 'sci-fi' }, { title: 1, authorId: 1 })
  .toArray();
const authorIds = [...new Set(books.map((x) => x.authorId.toHexString()))].map(
  (h) => ObjectId(h),
);
const names = new Map(
  db.authors
    .find({ _id: { $in: authorIds } })
    .toArray()
    .map((a) => [a._id.toHexString(), a.name]),
);
books.forEach((x) =>
  print('  ', x.title, '—', names.get(x.authorId.toHexString())),
);
// Prisma does the same thing for you with `include`; in MongoDB it is explicit.

section('4. The cost of embedding: duplicated data');
// Gollancz is embedded in two books. Renaming it means updating every copy.
const r = db.books.updateMany(
  { 'publisher.name': 'Gollancz' },
  { $set: { 'publisher.name': 'Gollancz (Orion)' } },
);
print('copies updated:', r.modifiedCount);
// Fine for data that rarely changes. For data that changes often, a reference
// is usually better. This trade-off is the core of L2.

section('5. Loans: a separate collection that references books and members');
db.members.drop();
db.members.insertMany([
  { _id: 'm-mona', name: 'Mona' },
  { _id: 'm-omar', name: 'Omar' },
]);
db.loans.insertMany([
  {
    bookId: book(7),
    memberId: 'm-mona',
    loanedAt: ISODate('2026-09-01T00:00:00Z'),
    returnedAt: null,
  },
  {
    bookId: book(10),
    memberId: 'm-mona',
    loanedAt: ISODate('2026-09-15T00:00:00Z'),
    returnedAt: null,
  },
  {
    bookId: book(7),
    memberId: 'm-omar',
    loanedAt: ISODate('2026-08-01T00:00:00Z'),
    returnedAt: ISODate('2026-08-20T00:00:00Z'),
  },
]);
// Why not embed loans inside the book? A popular book would collect loans
// forever (an unbounded array), and "Mona's open loans" would have to search
// inside every book. Loans grow without limit and are queried on their own,
// so they get their own collection — like vehicle_assignments in FleetOps.
const open = db.loans.find({ memberId: 'm-mona', returnedAt: null }).toArray();
open.forEach((l) =>
  print('  Mona has:', db.books.findOne({ _id: l.bookId }).title),
);

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/06-solutions.js)
//
// 1. Print every Mahfouz book with the author's name and country, using two
//    queries in total (not one per book).
// 2. For 'Guards! Guards!', print the names of every member who ever borrowed
//    it, using one query on loans and one on members.
// 3. Thinking question: authors are referenced, publishers are embedded.
//    Would you swap either decision? Write two sentences in NOTES.md.
// ---------------------------------------------------------------------------
