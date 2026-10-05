// Learning Stage 1 — Exercise 01: documents, BSON types and ObjectId
//
// Run: docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/01-documents-and-bson.js
//
// Concepts
// - A document is an ordered set of field/value pairs, stored as BSON.
// - BSON is binary JSON with more types: Date, ObjectId, Int32, Int64 ("Long"),
//   Double, Decimal128, binary data… JSON only has string, number, boolean,
//   null, array and object.
// - A collection does not enforce a schema: two documents can have different
//   fields, or the same field with different types.
// - Every document has an _id. If you do not set one, the driver creates an
//   ObjectId: 4 bytes of creation time + 5 random bytes + a 3-byte counter.

load('/learning/l1-fundamentals/lib/library.js');
db.bson_demo.drop();

section('1. One document, many BSON types');
db.bson_demo.insertOne({
  label: 'typed',
  title: 'Foundation', //              string
  pages: 255, //                       whole number: mongosh stores it as Int32
  rating: 4.2, //                      fractional number: Double
  copies: NumberInt(3), //             Int32, written explicitly
  isbnNumber: NumberLong('9780553293357'), // Int64
  price: NumberDecimal('9.99'), //     Decimal128: exact, use it for money
  available: true, //                  boolean
  subtitle: null, //                   null (different from a missing field)
  genres: ['sci-fi'], //               array
  publisher: { name: 'Gnome Press', country: 'US' }, // embedded document
  publishedAt: ISODate('1951-06-01T00:00:00Z'), //    Date
});
printjson(db.bson_demo.findOne({ label: 'typed' }, { _id: 0 }));

section('2. Ask MongoDB which BSON type each field has');
// $type returns the stored type. This is what MongoDB sees, not what you meant.
printjson(
  db.bson_demo
    .aggregate([
      { $match: { label: 'typed' } },
      {
        $project: {
          _id: { $type: '$_id' },
          pages: { $type: '$pages' },
          rating: { $type: '$rating' },
          copies: { $type: '$copies' },
          isbnNumber: { $type: '$isbnNumber' },
          price: { $type: '$price' },
          subtitle: { $type: '$subtitle' },
          missingField: { $type: '$doesNotExist' },
          genres: { $type: '$genres' },
          publisher: { $type: '$publisher' },
          publishedAt: { $type: '$publishedAt' },
        },
      },
    ])
    .toArray()[0],
);

section('3. ObjectId carries its creation time');
const id = db.bson_demo.findOne({ label: 'typed' })._id;
print('ObjectId:   ', id.toHexString());
print('created at: ', id.getTimestamp().toISOString().slice(0, 10), '(today)');
// Because the time comes first, ObjectIds created later sort after earlier ones
// (roughly — only to the second, and only per machine). FleetOps uses UUIDv7
// for the same reason: time-ordered ids keep index inserts at the "end".

section('4. Pitfall: a date stored as a string');
db.bson_demo.insertOne({ label: 'string-date', publishedAt: '1951-06-01' });
const since1950 = { publishedAt: { $gte: ISODate('1950-01-01T00:00:00Z') } };
print('documents matching publishedAt >= 1950 (Date):');
db.bson_demo
  .find(since1950, { _id: 0, label: 1 })
  .forEach((d) => print('  ', d.label));
// Only 'typed' matches. Comparison operators compare within the same BSON type,
// so the string '1951-06-01' is never >= a Date. Nothing warns you about this:
// the schema is not enforced, so the bad value was accepted silently.

section('5. Pitfall: the same field with different types');
db.bson_demo.insertOne({ label: 'string-pages', pages: '255' });
print('pages: 255 matches:  ', db.bson_demo.countDocuments({ pages: 255 }));
print('pages: "255" matches:', db.bson_demo.countDocuments({ pages: '255' }));
// Numbers of different numeric types DO compare equal (Double 255 == Int32 255;
// other drivers, e.g. Node.js, may store 255 as a Double — it still matches),
// but a string never equals a number. In PostgreSQL the column type would have
// rejected the string on insert.

// ---------------------------------------------------------------------------
// YOUR TURN (solutions in solutions/01-solutions.js)
//
// 1. Insert a document { label: 'mine', price: ... } where price is the exact
//    amount 19.90. Then count the documents in bson_demo whose price is
//    stored as Decimal128 (hint: { price: { $type: 'decimal' } }).
// 2. Create a new ObjectId with `new ObjectId()` and print its timestamp.
//    Then create ObjectId('65a1b2c3' + '0000000000000000') and print its
//    timestamp. What date do the first 8 hex characters encode?
// 3. Find every document in bson_demo where `pages` is a string.
//    (hint: $type: 'string')
// ---------------------------------------------------------------------------
