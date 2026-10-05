// Shared helpers for Learning Stage 1. Loaded by every exercise with
// load('/learning/l1-fundamentals/lib/library.js').
//
// The data set is a small library: authors, books and loans. It has nothing
// to do with FleetOps on purpose, so MongoDB is learned on its own terms.

function section(title) {
  print('');
  print('=== ' + title + ' ===');
}

// Fixed ids so the output of every exercise is the same on every run.
// (Their embedded timestamps are meaningless; see exercise 01 for real ones.)
const ids = {
  leGuin: ObjectId('a00000000000000000000001'),
  mahfouz: ObjectId('a00000000000000000000002'),
  pratchett: ObjectId('a00000000000000000000003'),
  adichie: ObjectId('a00000000000000000000004'),
  asimov: ObjectId('a00000000000000000000005'),
};

function book(n) {
  return ObjectId('b000000000000000000000' + String(n).padStart(2, '0'));
}

// Drops and recreates the library collections. Every exercise calls this
// first, so exercises can be run in any order and any number of times.
function seedLibrary(db) {
  db.authors.drop();
  db.books.drop();
  db.loans.drop();

  db.authors.insertMany([
    { _id: ids.leGuin, name: 'Ursula K. Le Guin', country: 'US', born: 1929 },
    { _id: ids.mahfouz, name: 'Naguib Mahfouz', country: 'EG', born: 1911 },
    { _id: ids.pratchett, name: 'Terry Pratchett', country: 'GB', born: 1948 },
    {
      _id: ids.adichie,
      name: 'Chimamanda Ngozi Adichie',
      country: 'NG',
      born: 1977,
    },
    { _id: ids.asimov, name: 'Isaac Asimov', country: 'US', born: 1920 },
  ]);

  const gollancz = { name: 'Gollancz', country: 'GB' };
  const ace = { name: 'Ace Books', country: 'US' };

  db.books.insertMany([
    {
      _id: book(1),
      title: 'A Wizard of Earthsea',
      authorId: ids.leGuin,
      year: 1968,
      pages: 183,
      genres: ['fantasy'],
      rating: 4.5,
      copies: 3,
      publisher: { name: 'Parnassus Press', country: 'US' },
    },
    {
      _id: book(2),
      title: 'The Left Hand of Darkness',
      authorId: ids.leGuin,
      year: 1969,
      pages: 304,
      genres: ['sci-fi'],
      rating: 4.3,
      copies: 2,
      publisher: ace,
    },
    {
      _id: book(3),
      title: 'The Dispossessed',
      authorId: ids.leGuin,
      year: 1974,
      pages: 387,
      genres: ['sci-fi', 'philosophy'],
      rating: 4.4,
      copies: 1,
      publisher: ace,
    },
    {
      _id: book(4),
      title: 'Palace Walk',
      authorId: ids.mahfouz,
      year: 1956,
      pages: 498,
      genres: ['literary', 'historical'],
      rating: 4.2,
      copies: 2,
      publisher: { name: 'Maktabat Misr', country: 'EG' },
    },
    {
      _id: book(5),
      title: 'Children of the Alley',
      authorId: ids.mahfouz,
      year: 1959,
      pages: 448,
      genres: ['literary'],
      rating: 4.1,
      copies: 1,
      publisher: { name: 'Dar al-Adab', country: 'LB' },
    },
    {
      // No rating: documents in one collection do not need the same fields.
      _id: book(6),
      title: 'Midaq Alley',
      authorId: ids.mahfouz,
      year: 1947,
      pages: 286,
      genres: ['literary'],
      copies: 0,
      publisher: { name: 'Maktabat Misr', country: 'EG' },
    },
    {
      _id: book(7),
      title: 'Guards! Guards!',
      authorId: ids.pratchett,
      year: 1989,
      pages: 288,
      genres: ['fantasy', 'comedy'],
      rating: 4.6,
      copies: 4,
      publisher: gollancz,
    },
    {
      _id: book(8),
      title: 'Small Gods',
      authorId: ids.pratchett,
      year: 1992,
      pages: 284,
      genres: ['fantasy', 'comedy', 'philosophy'],
      rating: 4.5,
      copies: 2,
      publisher: gollancz,
    },
    {
      _id: book(9),
      title: 'Going Postal',
      authorId: ids.pratchett,
      year: 2004,
      pages: 394,
      genres: ['fantasy', 'comedy'],
      rating: 4.5,
      copies: 0,
      publisher: { name: 'Doubleday', country: 'GB' },
    },
    {
      _id: book(10),
      title: 'Half of a Yellow Sun',
      authorId: ids.adichie,
      year: 2006,
      pages: 433,
      genres: ['historical', 'literary'],
      rating: 4.4,
      copies: 2,
      publisher: { name: 'Fourth Estate', country: 'GB' },
    },
    {
      _id: book(11),
      title: 'Americanah',
      authorId: ids.adichie,
      year: 2013,
      pages: 477,
      genres: ['literary'],
      rating: 4.3,
      copies: 1,
      publisher: { name: 'Fourth Estate', country: 'GB' },
    },
    {
      // An extra embedded document only this book has.
      _id: book(12),
      title: 'Foundation',
      authorId: ids.asimov,
      year: 1951,
      pages: 255,
      genres: ['sci-fi'],
      rating: 4.2,
      copies: 3,
      publisher: { name: 'Gnome Press', country: 'US' },
      series: { name: 'Foundation', number: 1 },
    },
  ]);
}
