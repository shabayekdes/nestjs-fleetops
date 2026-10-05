// Solutions — Exercise 01. Run exercise 01 first: these use its bson_demo collection.
load('/learning/l1-fundamentals/lib/library.js');

section('1. Exact money: Decimal128');
db.bson_demo.deleteMany({ label: 'mine' });
db.bson_demo.insertOne({ label: 'mine', price: NumberDecimal('19.90') });
// NumberDecimal takes a string: NumberDecimal(19.90) would first make the
// double 19.9, which is fine here but not for values like 0.1 + 0.2.
print(
  'documents with a Decimal128 price:',
  db.bson_demo.countDocuments({ price: { $type: 'decimal' } }),
);

section('2. ObjectId timestamps');
print('new ObjectId():', new ObjectId().getTimestamp().toISOString());
print(
  '65a1b2c3…:     ',
  ObjectId('65a1b2c3' + '0000000000000000')
    .getTimestamp()
    .toISOString(),
);
// The first 8 hex characters are seconds since 1970: 0x65a1b2c3 = 1705095875.
// Anyone who sees an ObjectId can tell when it was created — do not use them
// where creation time is sensitive.

section('3. pages stored as a string');
db.bson_demo
  .find({ pages: { $type: 'string' } }, { _id: 0, label: 1, pages: 1 })
  .forEach(printjson);
