# L1 — MongoDB fundamentals: notes

## The model

```text
MongoDB server (mongod)
└── database          (learning_l1)          ≈ a PostgreSQL database
    └── collection    (books)                ≈ a table, but with no schema
        └── document  { _id, title, … }      ≈ a row, but can nest objects and arrays
```

- Databases and collections are created on first write. There is no DDL and no migration.
- Documents are stored as **BSON**. It has more types than JSON: `Date`, `ObjectId`, `Int32`, `Int64`, `Double`, `Decimal128`, binary data.
- Every document has a unique `_id`. The default is an **ObjectId**: 4 bytes of seconds since 1970, 5 random bytes and a 3-byte counter. It is roughly time-ordered, like FleetOps' UUIDv7 ids, and anyone can read its creation time.

## PostgreSQL + Prisma vs MongoDB, for what L1 covered

| Topic             | FleetOps (PostgreSQL + Prisma)                         | MongoDB                                                                     |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Schema            | `schema.prisma` + migrations; the database enforces it | None by default. Any document shape is accepted (validation is opt-in, L7). |
| Wrong type        | Insert rejected                                        | Accepted silently. A string date never matches a `Date` range (ex. 01).     |
| Nested data       | Separate table + foreign key                           | Embedded document or array, queried with dot notation                       |
| Joins             | SQL join / Prisma `include`                            | Second query in the application (ex. 06), or `$lookup` (L5)                 |
| Foreign keys      | `onDelete: Restrict`                                   | None. Orphans are allowed; rules live in code (ex. 05)                      |
| Unique            | Any `@@unique`                                         | Only `_id` until you create a unique index (L3)                             |
| Bulk insert       | `createMany` is all-or-nothing                         | `insertMany` writes up to the error (ordered) or all it can (unordered)     |
| Partial update    | Prisma `update` changes listed fields                  | `$set` changes listed fields; `replaceOne` replaces the whole document      |
| Counters          | `{ increment: 1 }` (atomic `UPDATE`)                   | `$inc` (atomic on one document)                                             |
| Conditional write | `WHERE` + check in a transaction                       | Condition in the filter: `{ copies: { $gt: 0 } }` + `$inc` (ex. 04)         |
| Field list        | Prisma `select`                                        | Projection: inclusion **or** exclusion, not both                            |
| Pagination        | `skip` / `take` (offset)                               | `skip` / `limit` (offset) or range on a unique sort key                     |

## Pitfalls seen in the exercises

1. **Types are not enforced.** `'1951-06-01'` (string) and `ISODate('1951-06-01')` are different values. Range queries compare within one type, so the string never matches.
2. **mongosh stores whole numbers as Int32** and fractional ones as Double. Numbers of different numeric types compare equal. Strings and numbers never do.
3. **`{ field: null }` matches null and missing.** Range operators (`$lt`, `$gt`) never match a missing field.
4. **`$ne` on an array** means "no element equals", and plain equality on an array means "some element equals".
5. **`replaceOne` deletes every field you leave out.** Use `$set` for partial updates.
6. **`$push` duplicates, `$addToSet` does not.** Use `$addToSet` when an update must be safe to repeat.
7. **`deleteOne` with a broad filter** removes an arbitrary match. Delete by `_id`.
8. **No foreign keys.** A "check, then delete" in code has a race window.
9. **Offset pagination costs grow with the page number** (19 910 keys examined for page 1 991 vs 10 with range paging). It also skips items when earlier items are deleted.
10. **Range pagination needs a unique sort key that every document has.** Add `_id` as a tie-breaker. A missing sort field silently drops documents (07, task 2).

## How this relates to FleetOps (looking ahead)

- Telemetry readings are a time-ordered stream that grows without limit. That makes range pagination (pitfall 9) the default, not offset.
- A telemetry device sending `"speed": "82"` instead of `82` would be accepted silently (pitfall 1). Validation at the boundary matters more without a schema. This is an L7 topic.
- Telemetry has nothing like the core's foreign keys (pitfall 8). "Does this vehicle exist in this organization?" has to be checked in code. This is an L8/L10 topic.

## My notes

<!-- Your own observations, answers to the thinking questions (06, task 3), open questions. -->
