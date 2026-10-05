// Solutions — Exercise 04
load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section("1. Add 'classic' to books before 1960, idempotently");
for (const run of [1, 2]) {
  const r = db.books.updateMany(
    { year: { $lt: 1960 } },
    { $addToSet: { genres: 'classic' } },
  );
  print(
    'run',
    run,
    '→ matched:',
    r.matchedCount,
    '| modified:',
    r.modifiedCount,
  );
}
// $addToSet makes the update safe to repeat. $push would add a second 'classic'.

section("2. Lend 'Small Gods' only while copies remain");
for (const attempt of [1, 2, 3]) {
  const r = db.books.updateOne(
    { title: 'Small Gods', copies: { $gt: 0 } },
    { $inc: { copies: -1 } },
  );
  print(
    'attempt',
    attempt,
    '→',
    r.modifiedCount === 1 ? 'lent' : 'no copy left',
  );
}
// The check and the change happen in one atomic operation on the server, so
// two members can never both take the last copy.

section('3. Rename pages → pageCount');
const r = db.books.updateMany({}, { $rename: { pages: 'pageCount' } });
print('modified:', r.modifiedCount);
printjson(
  db.books.findOne(
    { title: 'Foundation' },
    { _id: 0, title: 1, pages: 1, pageCount: 1 },
  ),
);
