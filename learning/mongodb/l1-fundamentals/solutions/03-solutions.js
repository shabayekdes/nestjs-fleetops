// Solutions — Exercise 03
load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);
const show = (c) => c.forEach((d) => print('  ', JSON.stringify(d)));

section('1. Sci-fi before 1970, oldest first');
show(
  db.books
    .find(
      { genres: 'sci-fi', year: { $lt: 1970 } },
      { _id: 0, title: 1, year: 1 },
    )
    .sort({ year: 1 }),
);

section('2. Published in GB, at least one copy, by title');
show(
  db.books
    .find(
      { 'publisher.country': 'GB', copies: { $gte: 1 } },
      { _id: 0, title: 1, 'publisher.name': 1 },
    )
    .sort({ title: 1 }),
);

section('3. The two longest books');
show(
  db.books
    .find({}, { _id: 0, title: 1, pages: 1 })
    .sort({ pages: -1 })
    .limit(2),
);

section('4. Not literary');
show(
  db.books.find(
    { genres: { $ne: 'literary' } },
    { _id: 0, title: 1, genres: 1 },
  ),
);
// Yes, Half of a Yellow Sun is excluded. On an array, { $ne: x } means
// "no element equals x" — the opposite of { genres: x } ("some element equals x").
