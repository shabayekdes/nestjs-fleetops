# L4 — MongoDB querying: notes

## Operators that surprise

| What                                       | Behaviour                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `{ speed: {…}, speed: {…} }` in JavaScript | The second key silently replaces the first. Put both in one object, or use `$and`        |
| `{ field: null }`                          | Matches `null` **and** missing                                                           |
| `{ $exists: false }` / `{ $type: 'null' }` | Only missing / only explicit `null`                                                      |
| `{ $not: { $type: 'number' } }`            | "No usable value": missing, `null` and wrong types together                              |
| `{ fuelLevel: { $gt: 50 } }`               | Never matches the string `"85"`: comparisons stay within one type                        |
| `{ engine: { on: true } }`                 | Exact match of the whole embedded document; use `'engine.on': true`                      |
| Two dot-notation conditions on an array    | Can be satisfied by **different** elements; use `$elemMatch` for "one element with both" |
| Array literal `[{ code, severity }]`       | Exact array, exact fields, exact field order                                             |
| `$size`                                    | Exact length only; "two or more" is `{ 'arr.1': { $exists: true } }`                     |

Wrong types and wrong operators never raise errors. They show up as results that are quietly too small or too large.

## Index use per operator (measured)

| Filter on `{ organizationId, fuelLevel }` | Keys | Docs | Returned |
| ----------------------------------------- | ---- | ---- | -------- |
| `fuelLevel < 60`                          | 246  | 246  | 246      |
| `fuelLevel: null`                         | 31   | 30   | 30       |
| `$exists: false`                          | 30   | 30   | 18       |
| `$type: 'null'`                           | 30   | 30   | 12       |
| `$not: { $type: 'number' }`               | 1800 | 1800 | 38       |

- Ranges and `$in` are exact. `$nin` and `$ne` turn into ranges around the excluded values: efficient per result, but they return most of the data.
- The index stores missing and `null` as the same key, so the difference costs a FETCH.
- `$not` and `$expr` cannot narrow the index. If a data-quality query runs often, store a flag at write time or reject bad values on the way in (L7).

## Updates

- One document = one atomic update. Do arithmetic in the database (`$inc`, `$max`, `$min`, `$push` with `$slice`), never read-modify-write: two interleaved writers turned 2 readings into a count of 1.
- Array elements in place: `$` (first matched), `$[]` (all), `$[name]` + `arrayFilters` (the matching ones). The filter picks documents; `arrayFilters` picks elements.
- `findOneAndUpdate` changes and returns in one step: a safe "claim the next alert" for workers, or the previous value (`returnDocument: 'before'`).

## Upserts: the latest-position pattern

```js
db.latestPosition.createIndex(
  { organizationId: 1, vehicleId: 1 },
  { unique: true },
);

updateOne(
  { organizationId, vehicleId, timestamp: { $lt: reading.timestamp } }, // guard
  { $set: { timestamp, location } },
  { upsert: true },
);
// E11000 → the stored position is newer: ignore.
```

- A naive upsert (`$set` with no guard) let a late 08:30 reading overwrite 09:00.
- The guard in the filter makes the result independent of delivery order: 1 800 shuffled readings, 0 wrong positions.
- **Without the unique index, the same guarded upsert inserted a second document** instead of failing. Every upsert needs a unique index on the equality fields of its filter.
- Each stale reading costs a failed write and an exception. For backlogs, a pipeline update with `$cond` keeps the stored values without an error (solution 03), at the cost of a harder-to-read update.
- Do not put counters in a guarded update: a stale reading skips the `$inc` too.

## Bulk writes

| Option           | On error                                                | Use for                                |
| ---------------- | ------------------------------------------------------- | -------------------------------------- |
| `ordered: true`  | Stops; everything before is written, after is not tried | Operations that depend on earlier ones |
| `ordered: false` | Tries everything; reports all errors at the end         | Independent readings (telemetry)       |

- A bulk write is not a transaction. `MongoBulkWriteError` has `result.insertedCount` and `writeErrors[]`, and each `index` points back into the array you sent.
- **Retries are safe with a natural unique key** (`organizationId, vehicleId, timestamp`): resend the whole batch unordered, treat `11000` as "already stored".
- Classify errors: `11000` → success; per-document errors such as invalid GeoJSON (`16755`) → will fail on every retry, store them in a rejected-readings collection; no `writeErrors` at all (network, timeout) → outcome unknown, retry the whole batch.
- Two collections (readings + latest position) are two writes: the position can lag if the process dies in between. Acceptable for telemetry; not for money (L14).
- Batching matters: 2 000 readings took 743 ms one by one and 34 ms with `insertMany`, on the same machine. Over a network the gap grows.

## For the L8 telemetry prototype

- Ingestion: unordered `insertMany`, natural key, `11000` = success, rejected readings kept with their error.
- Latest position: guarded upsert + unique index; counters in a separate update.
- Validate types at the API boundary: the database will not complain about a string fuel level.
- Open: time series collections cannot have the natural-key unique index (L3), so retries there need another answer (L13).

## My notes

<!-- Add your own decisions, trade-offs and open questions here. -->
