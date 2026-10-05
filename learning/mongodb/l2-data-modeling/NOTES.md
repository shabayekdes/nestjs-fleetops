# L2 — MongoDB data modeling: notes

## Access patterns before design

The core idea in Stage 2 is: start with the queries the application will run, then choose the model that matches them.

Write the access patterns down first: what is read, what is written, and how often. Every exercise starts with that list (section 0).

- If the app reads a vehicle list together with its organization, embedding is okay.
- If the app updates a single vehicle status often, a separate `vehicles` collection is easier.
- If telemetry is append-heavy and time-windowed, one document per reading is the natural model, and bucketing per vehicle-hour is the main alternative (exercise 04).
- If maintenance events are inspected by vehicle and by timeline, a dedicated `maintenanceEvents` collection wins.

## Decision rules

| Embed when…                                     | Reference (separate collection) when…                        |
| ----------------------------------------------- | ------------------------------------------------------------ |
| one-to-one or one-to-few, and **bounded**       | the "many" side is large or grows without limit              |
| always read together with the parent            | read, paged or filtered on its own                           |
| rarely changes, or changes together with parent | updated on its own, often (hot fields)                       |
| belongs to this parent only                     | shared by many parents, or the relationship has its own data |

## Patterns used

| Pattern                 | Where                             | Trade-off                                                                                    |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Embedded one-to-one     | `vehicle.registration`            | One read; fine because it is small and always read with the vehicle.                         |
| Reference by id         | `vehicles.organizationId`         | Small independent documents; a second query when both are needed.                            |
| Relationship collection | `assignments`                     | Holds the pair's own data (dates); answers both directions; rules need indexes (L3) or code. |
| Extended reference      | `maintenanceEvents.vehicle.plate` | No join for lists; the copy can go stale — decide snapshot vs kept-in-sync on purpose.       |
| Summary / latest copy   | `vehicleStatus`                   | Tiny current-state reads; two writes per reading, can lag.                                   |
| Bucket                  | `readings_hourly`                 | 360× fewer documents, cheaper summaries; complex writes, whole-hour reads.                   |

## Measured in the exercises

| What                                             | Result                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| One organization embedding 5 000 vehicles        | ~755 KB in one document                                                 |
| One telemetry reading (flat)                     | ~196–199 bytes                                                          |
| One vehicle + 1 day of readings (8 640) embedded | ~1.1 MB → 16 MB limit in **~14 days**                                   |
| 20 vehicles × 6 h at 10 s, flat                  | 43 200 documents, ~8.2 MB                                               |
| Same data, bucketed per vehicle-hour             | 120 documents, ~5.3 MB (avg ~45 KB)                                     |
| Range 08:05–08:06 for one vehicle                | flat: 6 documents; bucket: 1 document, 360 readings transferred, 6 used |

The 16 MB limit was not the first problem in any exercise. Read and write cost (big documents read and rewritten for small changes, all writers sharing one document) comes much earlier.

## Things the model alone does not protect

- **One active assignment per vehicle:** nothing stops a second `endedAt: null` document. Use a partial unique index (L3) or check in code.
- **Multi-document changes** (end one assignment, start another): two writes with no transaction can leave the data half-changed. Use multi-document transactions (replica set, L14), or model the change so that one write is enough.
- **Denormalized copies** (`plate`, `vehicleStatus`) can be stale. Copy only fields that never change, or whose old value is meaningful. Never copy fields that drive business rules (e.g. a license expiry date).
- **Tenant isolation:** every document carries `organizationId` and every query filters by it, as in FleetOps.

## FleetOps-like design choices

### 1. Organization + vehicles

- A single organization usually owns many vehicles.
- A vehicle is updated often (location, status, driver, assignment history, maintenance state).
- A large embedded array can become noisy and expensive to mutate.
- Recommendation: `organizations` stores the organization; `vehicles` stores the fleet, with `organizationId` as the tenant and query key.

### 2. Telemetry readings

- These are high-volume, append-heavy and time-ordered.
- Queries ask for "last 30 minutes", "readings after 08:00" or "speed above 80".
- A document-per-reading model supports this cleanly and avoids a giant document.
- We keep a compact summary collection only for dashboards or frequently-needed aggregates. It is maintained with an upsert and a timestamp guard, so a late, older reading cannot overwrite a newer status.
- Bucketing per vehicle-hour is the main alternative: fewer documents and cheap hourly summaries, but more complex writes. MongoDB time series collections do this internally; they are evaluated in L3.

### 3. Maintenance and assignments

- Maintenance events have their own status transitions and timestamps.
- Assignment history across a driver/vehicle relationship often belongs in a separate collection because it is historical and can be queried on multiple dimensions.
- The model should optimize for the read/write patterns, not for object nesting.
- Maintenance events copy the vehicle plate (an extended reference). Here the plate at the time of service is acceptable history, so the copy is a snapshot and is never updated.

## My notes

<!-- Add your own decisions, trade-offs and open questions here. -->

- I would treat `vehicles` as a separate collection because the status, location and assignment fields change independently from the organization object.
- I would keep `telemetry` in a dedicated collection and use a small summary collection only for dashboard-heavy queries.
- `maintenanceEvents` should not live as a massive array in every vehicle document because it grows without bound and is easier to query by time and status as a separate collection.
