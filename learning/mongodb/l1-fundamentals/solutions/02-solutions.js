// Solutions — Exercise 02
load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. Keep going past a duplicate');
db.members.deleteMany({ _id: { $in: ['m-hana', 'm-karim'] } });
db.members.updateOne(
  { _id: 'm-sara' },
  { $set: { name: 'Sara' } },
  { upsert: true },
);
try {
  db.members.insertMany(
    [
      { _id: 'm-hana', name: 'Hana' },
      { _id: 'm-sara', name: 'Sara again' },
      { _id: 'm-karim', name: 'Karim' },
    ],
    { ordered: false },
  );
} catch (e) {
  print('inserted:', e.result.insertedCount, '| errors:', e.writeErrors.length);
}

section('2. Authors born before 1930');
print(db.authors.countDocuments({ born: { $lt: 1930 } }));

section('3. The book with a series');
print(db.books.findOne({ series: { $exists: true } }).title);
// A missing field is not an error, it simply does not match. Each document is
// checked on its own; there is no column that must exist in every row.
