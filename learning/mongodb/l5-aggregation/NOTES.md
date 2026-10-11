# L5 — Aggregation pipeline: notes

## Pipeline shape

```text
$match (tenant + time range, uses the index)
  → $set / $project (derive fields)
  → $group (one document per key)
  → $sort / $limit (top N)
  → $lookup (on the small result)
  → $project (shape the response)
```

| SQL                              | Aggregation                                   |
| -------------------------------- | --------------------------------------------- |
| `WHERE`                          | `$match`                                      |
| `SELECT expr AS x`               | `$project` / `$set`                           |
| `GROUP BY` + `COUNT/AVG/MIN/MAX` | `$group` with `$sum/$avg/$min/$max`           |
| `SUM(CASE WHEN … THEN 1 END)`    | `$sum: { $cond: [cond, 1, 0] }`               |
| `HAVING`                         | `$match` after `$group`                       |
| `ORDER BY … LIMIT`               | `$sort` + `$limit` (merged into a top-N sort) |
| `LEFT JOIN`                      | `$lookup`                                     |
| `LAG()`, `SUM() OVER (…)`        | `$setWindowFields` with `$shift`, `$sum`      |
| `INSERT … ON CONFLICT DO UPDATE` | `$merge`                                      |

## Rules learned

- **Tenant `$match` first, always.** Only the first stages can use an index. The optimizer moved a `$match` on the group key before the `$group`. It could not move a `$match` on an accumulator (`org: { $first: … }`), which then grouped all 25 920 readings instead of 8 640. Do not rely on the optimizer.
- **Decide what an average means.** Average speed "while driving" (`speed > 0`) and "over the day" are different numbers.
- **`$first` / `$last` need a `$sort` before the `$group`.** `$min` gives the lowest value but not the other fields of that document. Sort, then `$first`, to keep the document together.
- **A group is one document (16 MB).** `$push` of every reading into one group can hit it. `$addToSet` + `$size` counts distinct values.
- **Group first, join later.** `$lookup` runs once per input document: 31 ms after `$group` (4 joins) vs 852 ms before it (~7 000 joins). Tenant joins match `organizationId` as well as the id.
- **`$unwind` to count across documents, `$filter` to trim inside one.** `$unwind` drops documents with a missing or empty array unless told not to.

## Dates and time zones

- Dates are UTC instants. Days and hours exist only in a time zone, so every calendar grouping passes `timezone`.
- Three Cairo days of data were **four** UTC days, two of them partial. In UTC, a 07:00–19:00 Cairo shift reads as 04:00–16:00.
- Use an Olson name (`'Africa/Cairo'`), never a fixed offset. Cairo is UTC+3 until 29 October 2026 and UTC+2 after it: `'+03:00'` put 1 December 23:30 on 2 December.
- `$dateTrunc` returns a Date: sort, compare, store it. `$dateToString` returns a label: display it.
- Chart buckets: `$dateTrunc` with `binSize`, then `$densify` + `$fill` so empty buckets show as 0 instead of disappearing.
- The organization's time zone is data (stored per organization), not a constant in code.

## Window functions (`$setWindowFields`)

Partition by vehicle, sort by time, then:

| Need                         | Tool                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Previous reading's value     | `$shift: { output, by: -1 }`                                                                  |
| Fuel used                    | Sum of drops between consecutive readings, not max − min (75 vs ~85 points/day with a refuel) |
| Refuels, engine off events   | `$shift`, then `$match` on the transition                                                     |
| Distance without an odometer | `$integral` of speed over time (`unit: 'hour'` → km)                                          |
| Idle episodes                | Gaps and islands: mark starts, running `$sum` numbers the runs, `$group` by run               |
| Moving average               | `$avg` with `window: { documents: [-4, 0] }` or `range` + `unit`                              |

- The window only sees documents that passed earlier `$match` stages. Widen the range by the window size when the edges matter.
- A `$match` placed after a window stage cannot move before it: that would change which reading is "previous".
- Total idle time alone cannot tell a few long stops (v-102: 36 stops of 15 minutes) from many short ones.

## Stored summaries

- `$out` replaces a whole collection: use it for rebuilds (hourly buckets from readings, L2 deferred).
- `$merge` with `_id: { organizationId, vehicleId, day }` makes the daily summary **idempotent**: re-running a day replaces its summaries, never duplicates them. `whenMatched: 'merge'` adds new fields to existing summaries.
- Summarize complete days only, in the organization's time zone.
- A 3-day report read 12 summaries instead of examining 17 280 readings. For 1 000 vehicles over a month: 30 000 summaries vs 43 million readings.
- This is the retention model: raw readings expire (L3: TTL / `expireAfterSeconds`), summaries are kept.

## For the L8 telemetry prototype

- "Aggregated telemetry" = a nightly (re-runnable) `$merge` into `daily_vehicle_stats`. The API reads summaries for reports and raw readings only for short ranges.
- Distance from the odometer when present, `$integral` of speed otherwise. Fuel used from consecutive drops.
- Every pipeline starts with `$match: { organizationId }` (and a time range), backed by the L3 index.
- Open for L15: do summaries stay in MongoDB, or move to PostgreSQL next to the core data for reports that join them?

## My notes

<!-- Add your own decisions, trade-offs and open questions here. -->
