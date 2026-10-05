// Solutions — Exercise 06
load('/learning/l1-fundamentals/lib/library.js');
seedLibrary(db);

section('1. Mahfouz books with author name and country — two queries');
const mahfouz = db.authors.findOne({ name: 'Naguib Mahfouz' });
db.books
  .find({ authorId: mahfouz._id }, { _id: 0, title: 1 })
  .forEach((b) =>
    print('  ', b.title, '—', mahfouz.name, '(' + mahfouz.country + ')'),
  );

section("2. Everyone who borrowed 'Guards! Guards!'");
db.members.drop();
db.members.insertMany([
  { _id: 'm-mona', name: 'Mona' },
  { _id: 'm-omar', name: 'Omar' },
]);
db.loans.insertMany([
  { bookId: book(7), memberId: 'm-mona' },
  { bookId: book(10), memberId: 'm-mona' },
  { bookId: book(7), memberId: 'm-omar' },
]);
const memberIds = db.loans.distinct('memberId', { bookId: book(7) });
db.members
  .find({ _id: { $in: memberIds } })
  .forEach((m) => print('  ', m.name));

// 3. One possible answer:
// Publishers are small, change rarely and are always shown with the book, so
// embedding them is a good fit. Authors have their own page and data that
// grows (bio, awards), and many books share one author, so a reference avoids
// copying and updating author data in every book.
