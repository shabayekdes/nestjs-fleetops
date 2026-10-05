// Solutions — Exercise 07
load('/learning/l1-fundamentals/lib/library.js');

db.events.drop();
const batch = [];
for (let i = 1; i <= 20000; i++) {
  batch.push({ _id: i, type: i % 3 === 0 ? 'return' : 'loan' });
  if (batch.length === 5000) db.events.insertMany(batch.splice(0));
}

section("1. Range-paginate every 'return' event");
function rangePages(type, size) {
  let last = 0;
  let pages = 0;
  for (;;) {
    const page = db.events
      .find({ type, _id: { $gt: last } })
      .sort({ _id: 1 })
      .limit(size)
      .toArray();
    if (page.length === 0) return pages;
    pages++;
    last = page[page.length - 1]._id;
    print('  page', pages, ':', page.length, 'events, last _id', last);
  }
}
print('pages:', rangePages('return', 1000));

section('2. Range pagination on a non-unique sort key');
seedLibrary(db);
// Sort by rating desc, then _id asc as a unique tie-breaker. The "after"
// filter must reproduce that order: lower rating, OR same rating and higher _id.
const order = { rating: -1, _id: 1 };
let cursorKey = null;
let page = 0;
for (;;) {
  const filter = cursorKey
    ? {
        $or: [
          { rating: { $lt: cursorKey.rating } },
          { rating: cursorKey.rating, _id: { $gt: cursorKey._id } },
        ],
      }
    : {};
  const rows = db.books
    .find(filter, { title: 1, rating: 1 })
    .sort(order)
    .limit(4)
    .toArray();
  if (rows.length === 0) break;
  page++;
  print(
    '  page',
    page,
    ':',
    rows.map((r) => r.title + ' ' + (r.rating ?? '—')).join(' | '),
  );
  cursorKey = rows[rows.length - 1];
}
// Trap: Midaq Alley has no rating. It sorts last in a descending sort, but
// { rating: { $lt: … } } never matches a missing field, so it is silently
// skipped: 11 of 12 books are shown. Range pagination needs a sort key that
// every document has (or a default value).
