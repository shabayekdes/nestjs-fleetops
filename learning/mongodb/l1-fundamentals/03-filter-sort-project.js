// Learning Stage 1 — Exercise 03: filtering, sorting and projection
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/03-filter-sort-project.js
//
// Concepts
// - A filter is a document: { field: value } means equality, and
//   { field: { $operator: value } } applies an operator.
// - Several fields in one filter are combined with AND.
// - Dot notation reaches into embedded documents: 'publisher.country'.
// - Matching an array field against a value means "the array contains it".
// - Projection chooses which fields come back (like the SELECT list).
// - sort / limit / skip shape the result (ORDER BY / LIMIT / OFFSET).

load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

function show(cursor) {
  cursor.forEach((d) => print('  ', JSON.stringify(d)));
}
const titleOnly = { _id: 0, title: 1 };

section('1. Equality, and an implicit AND');
// SQL: SELECT title FROM books WHERE year = 1969
show(db.books.find({ year: 1969 }, titleOnly));
// SQL: ... WHERE author_id = :pratchett AND copies = 0
show(db.books.find({ authorId: ids.pratchett, copies: 0 }, titleOnly));

section('2. Comparison operators: $gt, $gte, $lt, $lte, $ne, $in');
// SQL: ... WHERE year >= 2000
show(db.books.find({ year: { $gte: 2000 } }, titleOnly));
// Two operators on one field form a range. SQL: ... WHERE pages BETWEEN 250 AND 290
show(
  db.books.find(
    { pages: { $gte: 250, $lte: 290 } },
    { _id: 0, title: 1, pages: 1 },
  ),
);
// SQL: ... WHERE author_id IN (:adichie, :asimov)
show(
  db.books.find({ authorId: { $in: [ids.adichie, ids.asimov] } }, titleOnly),
);

section('3. Embedded documents: dot notation');
// SQL would need a join to a publishers table, or a publisher_country column.
show(
  db.books.find(
    { 'publisher.country': 'EG' },
    { _id: 0, title: 1, publisher: 1 },
  ),
);

section('4. Arrays: "contains"');
// genres is an array, but the filter looks like plain equality.
show(db.books.find({ genres: 'philosophy' }, { _id: 0, title: 1, genres: 1 }));
// $all: the array contains every listed value (in any order).
show(db.books.find({ genres: { $all: ['fantasy', 'comedy'] } }, titleOnly));

section('5. Missing fields');
// Midaq Alley has no rating. Range operators skip missing fields…
print('rating < 4.3:      ', db.books.countDocuments({ rating: { $lt: 4.3 } }));
// …but { rating: null } matches both null AND missing.
print('rating null/missing:', db.books.countDocuments({ rating: null }));
print(
  'rating $exists:false:',
  db.books.countDocuments({ rating: { $exists: false } }),
);

section('6. Sorting and limiting');
// SQL: SELECT title, rating FROM books ORDER BY rating DESC, title ASC LIMIT 3
show(
  db.books
    .find({}, { _id: 0, title: 1, rating: 1 })
    .sort({ rating: -1, title: 1 })
    .limit(3),
);
// A tie-breaker matters: without `title: 1`, books with equal ratings can come
// back in any order, and pagination over them becomes unstable.

section('7. Projection: inclusion vs exclusion');
// Inclusion: only the listed fields (+ _id unless excluded).
printjson(
  db.books.findOne({ _id: book(12) }, { title: 1, 'series.number': 1 }),
);
// Exclusion: everything except the listed fields.
printjson(
  db.books.findOne(
    { _id: book(12) },
    { _id: 0, genres: 0, publisher: 0, authorId: 0 },
  ),
);
// You cannot mix them (except for _id: 0): { title: 1, genres: 0 } is an error.
try {
  db.books.findOne({}, { title: 1, genres: 0 });
} catch (e) {
  print('error:', e.message);
}
// FleetOps parallel: the API never returns passwordHash. In MongoDB, as in
// Prisma's `select`, you make that explicit with a projection.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/03-solutions.js)
//
// 1. Titles of sci-fi books published before 1970, oldest first.
// 2. Titles and publisher names of books published in the GB with at least
//    one copy available, sorted by title.
// 3. The two longest books (by pages): title and pages only, no _id.
// 4. Books that are NOT literary. Does { genres: { $ne: 'literary' } } exclude
//    a book whose genres are ['historical', 'literary']? Check and explain.
// ---------------------------------------------------------------------------
