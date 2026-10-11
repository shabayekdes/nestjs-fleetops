# L3 — Indexing and query performance: notes

## Reading explain()

| Verbosity           | Runs the query? | Use it for                                 |
| ------------------- | --------------- | ------------------------------------------ |
| `queryPlanner`      | No              | Which plan and index; safe on a slow query |
| `executionStats`    | Yes             | How much work: keys, documents, time       |
| `allPlansExecution` | Yes             | Also the work done by the rejected plans   |

Three numbers matter: `totalKeysExamined`, `totalDocsExamined` and `nReturned`. In the ideal plan they are equal. Common stages:

| Stage                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `COLLSCAN`           | Every document read. Cost grows with the collection, not the result           |
| `IXSCAN`             | A range of index keys walked                                                  |
| `FETCH`              | Documents loaded for the keys found; a filter here means wasted loads         |
| `SORT`               | In-memory sort: must read every match before returning the first (100 MB cap) |
| `PROJECTION_COVERED` | Answered from the index alone, `totalDocsExamined: 0`                         |
| `COUNT_SCAN`         | Count from index keys only                                                    |
| `CLUSTERED_IXSCAN`   | Range scan of a clustered collection (time series buckets, by time)           |

Time series queries run as an aggregation over buckets: the plan is under `stages[0].$cursor`, and "documents" are buckets.

## Designing an index

1. Write the access patterns first (as in L2). An index serves a pattern, not a field.
2. Order fields by **equality → sort → range** (ESR).
3. For tenant data, `organizationId` is always the first field. It is in every query anyway, so it costs nothing, and it keeps each tenant in its own part of the index.
4. A prefix of a compound index is an index too: `{ org, vehicle, time }` serves `{ org }` and `{ org, vehicle }`. Drop the shorter index when a longer one has it as a prefix.
5. Prefer selective fields. A boolean or status field narrows little; an index on it can be slower than a collection scan (measured: 117 ms vs 62 ms).
6. ESR is a rule of thumb. With no limit, a tight range plus a SORT (E-R) can beat E-S-R; with a limit (every paginated screen), E-S-R wins because it stops early.
7. Every index costs every insert. Keep only the ones a real access pattern uses (`$indexStats` shows usage).

## Index types used

| Type                  | FleetOps use                                                        | Watch out for                                                                                  |
| --------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Compound              | `{ organizationId, vehicleId, timestamp: -1 }`                      | Field order is the whole design                                                                |
| Unique, tenant-scoped | `{ organizationId, plate }`, like `@@unique` in Prisma              | A missing field indexes as `null` and collides; use a partial filter                           |
| Partial unique        | One active assignment: `partialFilterExpression: { endedAt: null }` | `null` also matches a missing field; the planner uses it only if the query includes the filter |
| TTL                   | Raw readings expire after N days                                    | Ignores non-date values (they never expire); deletes run every 60 s, one by one                |
| Multikey              | Vehicle tags, driver license classes                                | One key per element; at most one array field per compound index                                |
| `2dsphere`            | Reading locations (queries in L6)                                   | `[lng, lat]`; validates range and format, not meaning (swapped pairs pass)                     |

## Measured in the exercises

144 000 synthetic readings (3 tenants, 50 vehicles, one per minute for two days). Times are from one machine and only show the trend.

| What                                                           | Result                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| One vehicle, one hour, no index                                | 144 000 documents examined for 60 returned               |
| Same, index on `vehicleId` only                                | 2 880 keys and documents for 60                          |
| R1 (one vehicle, one day, limit 100), `{ org, time, vehicle }` | 2 989 keys for 100                                       |
| R1, ESR `{ org, vehicle, time }`                               | 100 keys for 100                                         |
| Latest reading, ESR index                                      | 1 key, whatever the history size                         |
| Covered chart query                                            | 1 440 keys, 0 documents                                  |
| Insert 144 000 readings, `_id` only → 6 indexes                | 1.6 s → 3.6 s (×2.2); indexes 1.4 → 9 MB vs 6 MB of data |
| Flat + ESR index, on disk                                      | 5.9 MB data + 3.0 MB indexes                             |
| Time series, `granularity: 'seconds'`                          | 2 400 buckets, 344 KB data + 112 KB indexes              |
| R1 one hour: flat vs time series                               | 60 keys + 60 documents vs 3 keys + 1 bucket              |
| Latest reading: flat vs time series                            | 1 key vs every bucket of the vehicle (48)                |

The time series compression is flattered by regular synthetic data; real device data will compress less.

## The key question

**Why does a telemetry workload need different indexes from transactional FleetOps data?**

- **Writes dominate.** Core data is written by people, a few times a day; telemetry by devices, continuously. In the core, an extra index is almost free. In telemetry, each index slows every one of millions of inserts and must fit in memory. Telemetry gets the fewest indexes that serve its access patterns.
- **Reads are time ranges per series.** Core reads are by id, by status, by name: point lookups and small lists. Telemetry reads are "this vehicle, this time window, newest first", so the index is `{ organizationId, vehicleId, timestamp: -1 }`: equality on the series, then time.
- **Data is append-only and expires.** Core rows are updated and kept forever, and their constraints (unique, one active assignment) live in indexes. Raw readings are never updated, need no unique constraint in the database (and time series collections cannot have one), and are deleted by age (TTL or bucket expiry).
- **Volume changes the trade-offs.** At 8.6 million readings per day for 1 000 vehicles, index size (estimated ~8 GB for 30 days) and storage shape (time series buckets) matter. At core volumes, they do not.

## Decision: telemetry shape (left open in L2)

**Raw readings: a time series collection** (`timeField: 'timestamp'`, `metaField: { organizationId, vehicleId }`), with an index on `{ 'meta.organizationId': 1, 'meta.vehicleId': 1, timestamp: -1 }` and retention by `expireAfterSeconds`. **Latest position: a separate latest-status document per vehicle** (L2), updated with a timestamp guard.

Why:

- Readings are append-only and never corrected, so the time series limits (no measurement updates, no `updateOne`) cost nothing.
- Much smaller on disk and in indexes, and range reads touch a few buckets.
- Bucketing is done by MongoDB: none of the hand-written bucket logic from L2.
- Retention drops whole buckets instead of deleting readings one by one.

What it costs, and who handles it:

- No unique index, so duplicate deliveries cannot be rejected by the database: idempotency in L13.
- "Latest reading" reads every bucket of a vehicle: the latest-status document handles it.
- Late or buffered uploads create extra buckets: acceptable for a prototype, watch it in L8.
- It cannot be converted later: re-check this decision at L7 before creating the collection in code.

## Things indexes do not solve

- **Wrong types.** A string timestamp is never matched by a date range and never expires. Validate at the boundary and with schema validation (L7).
- **Duplicates in time series.** No unique index; see L13.
- **Multi-document rules.** A partial unique index protects "one active assignment" on insert, but ending one assignment and starting another is still two writes (transactions, L14).

## My notes

<!-- Add your own decisions, trade-offs and open questions here. -->
