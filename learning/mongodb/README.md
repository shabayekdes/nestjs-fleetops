# MongoDB learning exercises

Exercises for the [MongoDB + Microservices Learning Track](../../docs/mongodb-microservices-track.md), Part A (Learning Stages 1–6).

**This folder is not part of FleetOps.** Nothing here is imported by `apps/api/` or `apps/web/`. The MongoDB below is used only for learning, and the root `docker-compose.yml` does not include it.

## Start MongoDB

Run from `learning/mongodb/`:

```bash
docker compose up -d --wait   # MongoDB 7.0 on 127.0.0.1:27017, no auth
docker compose exec mongo mongosh learning_l1   # interactive shell
docker compose down           # stop (data is kept in a volume)
docker compose down -v        # stop and delete the data
```

Set `MONGO_PORT` if 27017 is taken. MongoDB Compass can connect to `mongodb://127.0.0.1:27017`.

**Why MongoDB 7.0 and not 8.x:** MongoDB 8.0 and later refuse to start on Linux kernel 6.19+ because of a TCMalloc bug ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Everything in Part A works the same in 7.0. Move to 8.x once a fixed release is out.

## Run an exercise

Each exercise is a `mongosh` script. The folder is mounted read-only at `/learning` inside the container:

```bash
docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/01-documents-and-bson.js
```

Every exercise recreates its own data first, so you can run them in any order and as often as you like.

Each exercise has three parts:

1. **Concepts**: a short explanation in the header comment.
2. **Worked examples**: numbered sections whose output is explained in comments. Read the code, run it, compare.
3. **Your turn**: tasks at the end. Try them in `mongosh` (or a scratch file) before opening `solutions/`.

## Stages

| Stage | Folder                                   | Status |
| ----- | ---------------------------------------- | ------ |
| L1    | [`l1-fundamentals/`](l1-fundamentals/)   | Done   |
| L2    | [`l2-data-modeling/`](l2-data-modeling/) | Done   |
| L3    | [`l3-indexing/`](l3-indexing/)           | Done   |
| L4    | [`l4-querying/`](l4-querying/)           | Done   |
| L5    | [`l5-aggregation/`](l5-aggregation/)     | Done   |
| L6    | [`l6-geospatial/`](l6-geospatial/)       | Done   |

### L1 — MongoDB fundamentals

| File                                   | Topic                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `01-documents-and-bson.js`             | Documents, BSON types, ObjectId, type pitfalls           |
| `02-create-and-read.js`                | Implicit creation, inserts, duplicate `_id`, cursors     |
| `03-filter-sort-project.js`            | Operators, dot notation, arrays, missing fields, sorting |
| `04-update.js`                         | `$set`, `$inc`, array operators, `replaceOne`, upsert    |
| `05-delete.js`                         | Deletes, no foreign keys, soft delete                    |
| `06-embedding-and-references.js`       | Embedding vs referencing, joins in the application       |
| `07-pagination.js`                     | Offset vs range pagination, measured with `explain()`    |
| [`NOTES.md`](l1-fundamentals/NOTES.md) | Summary, SQL/Prisma comparison, pitfalls, your notes     |

### L2 — MongoDB data modeling

| File                                       | Topic                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `01-organization-and-vehicles.js`          | Access patterns, embedded vs referenced fleet, one-to-one, hot vs cold fields |
| `02-telemetry-readings.js`                 | One document per reading, latest-status summary, the 16 MB limit measured     |
| `03-maintenance-and-driver-assignments.js` | Many-to-many over time, extended references and stale copies                  |
| `04-bucket-pattern.js`                     | Bucketing readings per vehicle-hour, measured against flat documents          |
| [`NOTES.md`](l2-data-modeling/NOTES.md)    | Decision rules, patterns, measurements, what the model does not protect       |

Exercises use the `learning_l2` database: `docker compose exec mongo mongosh --quiet learning_l2 /learning/l2-data-modeling/01-organization-and-vehicles.js`. Solution 04 needs exercise 04 to have run first.

### L3 — Indexing and query performance

| File                               | Topic                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `01-explain-basics.js`             | `explain()`, COLLSCAN vs IXSCAN, selectivity, the planner's race                 |
| `02-compound-indexes-esr.js`       | Compound indexes, equality–sort–range, prefixes, sort direction, covered queries |
| `03-unique-partial-ttl.js`         | Tenant-scoped unique, partial unique (one active assignment), TTL expiry         |
| `04-multikey-and-geo-index.js`     | Multikey indexes, parallel arrays, creating a `2dsphere` index                   |
| `05-write-overhead.js`             | Insert and update cost per index, index sizes, unused indexes                    |
| `06-time-series.js`                | Time series collections vs flat documents: storage, explain, limits in 7.0       |
| [`NOTES.md`](l3-indexing/NOTES.md) | Reading explain, index design rules, measurements, the telemetry-shape decision  |

Exercises use the `learning_l3` database: `docker compose exec mongo mongosh --quiet learning_l3 /learning/l3-indexing/01-explain-basics.js`. Each exercise loads 144 000 synthetic readings (a few seconds). Solution 06 needs exercise 06 to have run first.

### L4 — MongoDB querying

| File                               | Topic                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `01-operators.js`                  | Speeding queries, `$or`/`$in`/`$nin`, missing vs null vs wrong type, index use per operator |
| `02-arrays-and-nested.js`          | `$elemMatch` vs dot notation, `$all`/`$size`, positional updates, bounded `$push`           |
| `03-atomic-updates-and-upserts.js` | Update operators, lost updates, `findOneAndUpdate`, the guarded latest-position upsert      |
| `04-bulk-writes.js`                | Ordered vs unordered, partial failures, safe retries, `bulkWrite`, batching                 |
| [`NOTES.md`](l4-querying/NOTES.md) | Operator pitfalls, index use, the upsert pattern, bulk-write error handling                 |

Exercises use the `learning_l4` database: `docker compose exec mongo mongosh --quiet learning_l4 /learning/l4-querying/01-operators.js`.

### L5 — Aggregation pipeline

| File                                  | Topic                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `01-pipeline-basics.js`               | `$match`/`$group`/`$project`/`$set`, accumulators, stage order and index use, `$facet`   |
| `02-dates-and-time-zones.js`          | Per-day and per-hour grouping in UTC vs `Africa/Cairo`, DST, `$densify` + `$fill`        |
| `03-distance-fuel-idle.js`            | Window functions: distance, refuels, fuel used, idle episodes, moving averages           |
| `04-unwind-lookup-summaries.js`       | `$unwind`, `$filter`, `$lookup` placement, `$out` buckets, daily summaries with `$merge` |
| [`NOTES.md`](l5-aggregation/NOTES.md) | Pipeline rules, SQL comparison, time zones, window functions, stored summaries           |

Exercises use the `learning_l5` database: `docker compose exec mongo mongosh --quiet learning_l5 /learning/l5-aggregation/01-pipeline-basics.js`. Solution 04 needs exercise 04 to have run first.

### L6 — Geospatial features

| File                                 | Topic                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `01-geojson-and-near.js`             | GeoJSON rules, tenant-first `2dsphere` index, `$near` / `$geoNear`, history near a point        |
| `02-geowithin-geofences.js`          | `$geoWithin`, `$geoIntersects`, polygons with holes, invalid polygons, circular fences          |
| `03-geofence-events.js`              | Enter/exit events: batch (`$geoNear` + `$shift`) and at ingestion, flapping, debouncing, visits |
| `04-location-history.js`             | GPS distance vs odometer, trips with `LineString` routes, thinning paths, privacy               |
| [`NOTES.md`](l6-geospatial/NOTES.md) | Operator choice, tenant isolation, event design, location history, what v2.x needs              |

Exercises use the `learning_l6` database: `docker compose exec mongo mongosh --quiet learning_l6 /learning/l6-geospatial/01-geojson-and-near.js`. All locations are synthetic. Solution 03 needs exercise 03 to have run first.

Part A (L1–L6) is complete. Part B (L7 onward) adds code to FleetOps and does not use this folder.
