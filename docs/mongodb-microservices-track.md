# FleetOps — MongoDB + Microservices Learning Track

This file plans a **learning track**: a guided way to learn MongoDB, NoSQL data modeling and microservices architecture using FleetOps telemetry as the example. It is **not** a continuation of the backend phases. There is no backend Phase 10. The backend roadmap ([`PHASES.md`](PHASES.md)) stays focused on the production FleetOps core and ends at Phase 9.

Nothing in this file is built yet. Every stage is a plan, started only with the user's approval.

Related documents:

- [`PHASES.md`](PHASES.md): the backend roadmap (Phases 1–9). The FleetOps core.
- [`frontend-roadmap.md`](frontend-roadmap.md): the Next.js frontend (FE1–FE9). Runs in parallel with this track.
- [`product-roadmap.md`](product-roadmap.md): product versions. This track feeds **v2.x GPS + telematics**.
- `CLAUDE.md`: conventions for the existing API. They still apply to any code this track adds to `apps/api/`.

To avoid confusion with the other roadmaps, stages are always called **Learning Stage N** (L1–L15). "Phase N" means a backend phase, and "FE N" a frontend phase.

| Stage | Name                                 | Part                  | Status  | Commit(s) |
| ----- | ------------------------------------ | --------------------- | ------- | --------- |
| L1    | MongoDB fundamentals                 | A: MongoDB            | Done    | `fe09f1b` |
| L2    | MongoDB data modeling                | A: MongoDB            | Done    | `518497c` |
| L3    | Indexing + query performance         | A: MongoDB            | Planned | —         |
| L4    | MongoDB querying                     | A: MongoDB            | Planned | —         |
| L5    | Aggregation pipeline                 | A: MongoDB            | Planned | —         |
| L6    | Geospatial features                  | A: MongoDB            | Planned | —         |
| L7    | NestJS + MongoDB                     | B: Telemetry workload | Planned | —         |
| L8    | First telemetry prototype            | B: Telemetry workload | Planned | —         |
| L9    | Microservices concepts               | C: Microservices      | Planned | —         |
| L10   | Extract telemetry                    | C: Microservices      | Planned | —         |
| L11   | Service-to-service communication     | C: Microservices      | Planned | —         |
| L12   | Telemetry ingestion vs processing    | C: Microservices      | Planned | —         |
| L13   | Distributed systems problems         | D: Production         | Planned | —         |
| L14   | MongoDB production concepts          | D: Production         | Planned | —         |
| L15   | PostgreSQL vs MongoDB decision (ADR) | D: Production         | Planned | —         |

---

## Where this track sits

```text
Backend Phase 1 → … → Backend Phase 9
                         │
                         ↓
               Backend production ready
                         │
          ┌──────────────┴──────────────┐
          ↓                             ↓
  Frontend roadmap               MongoDB + Microservices
  (FE1 → FE9)                    learning track (L1 → L15)
          │                             │
          ↓                             │
    FleetOps v1.0                       │
          │                             │
          ↓                             │
   Product roadmap                      │
   v1.1 → … → v2.0                      │
          │                             │
          └──────────────┬──────────────┘
                         ↓
               v2.x GPS + telematics
```

- The track starts after backend Phase 9 (done). It does not wait for the frontend.
- **The frontend does not depend on this track, and this track does not depend on the frontend.** Neither blocks the other. FleetOps v1.0 is reached through the frontend roadmap alone.
- What the track produces is **knowledge and a validated prototype**, which v2.x GPS + telematics can use. See "Connection to the product roadmap".

---

## Learning principle

The goal is **not** to turn FleetOps into a microservices system. The goal is to learn, in this order:

1. MongoDB.
2. NoSQL data modeling.
3. When MongoDB is (and is not) the right tool.
4. Microservices architecture.
5. Service boundaries.
6. Communication between services.
7. Event-driven architecture.
8. The problems that distributed systems bring.
9. How MongoDB can be used well inside one specific service.

Each step is learned on its own before the next one starts.

The FleetOps core stays a **modular NestJS monolith on PostgreSQL + Prisma**. Users, organizations, authentication, vehicles, drivers, assignments, maintenance and fuel are **not** split into services for the sake of learning. Splitting them would produce a distributed monolith: services that cannot be deployed, changed or kept consistent without each other.

**Telemetry** is the learning vehicle because its workload really is different from the core:

| Property     | FleetOps core (PostgreSQL)                         | Telemetry                                                   |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| Data shape   | Relational, many foreign keys, strict rules        | Append-only readings, one vehicle per reading               |
| Write volume | Low, human-driven                                  | High, device-driven, continuous                             |
| Reads        | Lists, details, small aggregates                   | Time ranges, latest position, aggregates, geospatial        |
| Consistency  | Strong, transactional (e.g. one active assignment) | A late or duplicate reading is normal and must be tolerated |
| Retention    | Kept for the life of the organization              | Raw data expires, summaries are kept                        |
| Scaling need | Modest                                             | Grows with vehicles × reading frequency                     |

---

## Architecture rules

These apply to every stage.

1. **Do not introduce microservices because they are popular.** Each split needs a reason specific to FleetOps.
2. **Do not split the existing FleetOps monolith prematurely.** The core modules stay in `apps/api/`.
3. **Start with a modular monolith.** Telemetry is first built as a well-isolated module (L8), and only then extracted (L10).
4. **Extract one meaningful bounded context first: telemetry.** No other context is extracted during this track.
5. **MongoDB is introduced because of a suitable workload, not because microservices require it.** A microservice can use PostgreSQL; MongoDB can live inside a monolith.
6. **A microservice owns its data.** No two services share tables or collections.

   Avoid:

   ```text
   Service A ─┐
   Service B ─┼─→ the same PostgreSQL tables
   Service C ─┘
   ```

   Prefer:

   ```text
   FleetOps Core      → PostgreSQL
   Telemetry Service  → MongoDB
   ```

   The telemetry service never reads FleetOps PostgreSQL tables. If it needs core data (e.g. "does this vehicle exist in this organization?"), it asks the core through an API or keeps its own copy built from events (L11).

7. **Every new distributed component has a documented reason.** A new service, broker, queue or database gets a short decision record: the problem, the options, the choice, the cost.
8. **Do not add infrastructure before the learning objective requires it.** No broker before L11, no second service before L10, no sharding before L14 (and probably not even then).

Rules that carry over from the core and are not relaxed for learning code:

- **Tenant isolation.** Every telemetry document carries `organizationId`. Every query filters by it, every index used by a tenant query starts with it, and access to another organization's data returns `404`, as in the core.
- **Location data is personal data about drivers.** Prototype data is synthetic. No real driver location data is collected during this track.
- **No secrets in code or commits**, including MongoDB connection strings.

---

## Learning workflow

Every stage follows the same loop:

```text
Learn → Small exercise → Apply to FleetOps → Review architecture
      → Write documentation → Test → Commit → Next stage
```

- **One stage at a time.** Never implement several stages at once, and never implement part of a later stage early.
- **Before a stage starts**, the main conversation presents:
  1. what will be learned;
  2. why it matters;
  3. how it relates to FleetOps;
  4. what will **not** be implemented yet;

  and **asks the user for approval** before any implementation.

- For stages that add code to FleetOps (L7 onward), the usual flow applies: `cto-esmail` plans, `be-dev-abdel-aziz` implements, `qa-dev-abdel-rahman` writes the tests, `cto-esmail` reviews.

### Working rules for Claude Code

- Do not silently implement future stages.
- Do not install dependencies (MongoDB driver, ODM, broker clients, …) without approval.
- Do not change the existing PostgreSQL schema unless a stage explicitly requires it and the user approves.
- Do not refactor the existing FleetOps backend unnecessarily.
- Do not convert the existing backend to microservices.
- Do not create several services just for demonstration.
- Keep changes incremental and every stage understandable on its own.
- Update this file when a stage is done (status, commit, what was learned and built, decisions, deferred items).
- Add tests for implemented functionality.
- Review the architecture before moving to the next stage.
- Commit each meaningful stage separately.

### Stage completion report

When a stage is complete, report:

```text
Stage:
Status:

What I learned:

What I implemented:

Architecture decisions:

Files changed:

Tests:

Deferred:

Commit:
```

---

## Part A — MongoDB (L1–L6)

Part A is about MongoDB itself. **No FleetOps code changes.** Exercises run against a local MongoDB with synthetic data. Exercises live in [`learning/mongodb/`](../learning/mongodb/) (decided at L1). They never go into `apps/api/` or `apps/web/`.

### Learning Stage 1 — MongoDB fundamentals

**Status:** Done (`fe09f1b`)

**Goal:** understand MongoDB before integrating it into anything.

**Topics:** MongoDB architecture; database, collection, document; BSON vs JSON; `ObjectId`; embedded documents; arrays; references; CRUD; `mongosh` and MongoDB Compass; basic filtering, sorting and projection; pagination concepts (skip/limit vs range-based "seek" pagination).

**What was learned** (details in [`learning/mongodb/l1-fundamentals/NOTES.md`](../learning/mongodb/l1-fundamentals/NOTES.md))

- MongoDB enforces no schema or types by default. Wrong types are accepted silently and only show up as queries that match nothing.
- MongoDB has no foreign keys. Rules such as "restrict delete" move into application code, where they have race windows.
- A conditional single-document update (a condition in the filter plus `$inc`) gives atomic "take one if available" without a transaction.
- `insertMany` is not all-or-nothing, and `replaceOne` drops the fields you leave out.
- Range pagination examined 10 index keys where offset pagination examined 19 910 for the same page. It needs a unique sort key that every document has.

**Built**

- `learning/mongodb/docker-compose.yml`: a learning-only MongoDB on localhost (separate compose project `fleetops-learning`). The root `docker-compose.yml` is untouched.
- Seven `mongosh` exercises on a neutral library data set (books, authors, loans), each with worked examples and "your turn" tasks, plus runnable solutions.
- `NOTES.md`: the concepts, a PostgreSQL/Prisma vs MongoDB comparison and the pitfalls found.

**Decisions**

1. Exercises live in `learning/mongodb/`, committed per stage and never imported by the apps.
2. MongoDB runs from a learning-only compose file, bound to `127.0.0.1` with no authentication.
3. **MongoDB 7.0.43, not 8.x.** MongoDB 8.0 and later (8.0.32, 8.3.11 and 9.0.2 were tested) refuse to start on Linux kernel 6.19+ because of a TCMalloc bug ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Part A behaves the same on 7.0. **L7 and L14 must re-check this** for CI runners and any deployment host.
4. No npm packages: the exercises run inside the container with the bundled `mongosh`.

**Deferred**

- Indexes beyond `_id` (L3), `$lookup` (L5), schema validation (L7).
- Upgrading to MongoDB 8.x once a fixed release exists.

### Learning Stage 2 — MongoDB data modeling

**Status:** Done (`518497c`)

**Goal:** learn how document modeling differs from relational modeling.

**Topics:** embedding vs referencing; one-to-one, one-to-many, many-to-many; document boundaries; denormalization; read-oriented vs write-oriented modeling; access-pattern-driven design; avoiding both excessive normalization and unbounded documents (the 16 MB limit, ever-growing arrays).

**What was learned** (details in [`learning/mongodb/l2-data-modeling/NOTES.md`](../learning/mongodb/l2-data-modeling/NOTES.md))

- The access patterns decide the model. Each exercise lists them before any data is written.
- Embed small, bounded data that is read with its parent (vehicle registration). Reference data that is large, grows, or is read and updated on its own (vehicles, maintenance events, telemetry).
- Many-to-many over time with its own data (driver ↔ vehicle with dates) is a relationship collection, like `vehicle_assignments` in FleetOps.
- Denormalized copies (extended references, a latest-status document) trade write work and consistency for read speed. Copy fields that never change, or whose old value is meaningful.
- Telemetry, measured:
  - Embedding a day of readings in a vehicle reaches the 16 MB limit in about 14 days.
  - Bucketing per vehicle-hour stores the same data in 360× fewer documents and about 35% less space, but needs more complex writes and returns whole hours.
- The 16 MB limit was never the first problem. Big shared documents cost reads, writes and contention long before that.
- Some rules are not enforced by the model at all: one active assignment per vehicle, and changes that span two documents. They need indexes (L3), transactions (L14) or code.

**Built**

- Four `mongosh` exercises in `learning/mongodb/l2-data-modeling/`:
  - organizations and vehicles;
  - telemetry readings and a latest-status summary;
  - assignments and maintenance;
  - the bucket pattern.
- Each exercise lists its access patterns and has worked examples, "your turn" tasks and runnable solutions.
- A shared seed (`lib/fleet.js`) where every document carries `organizationId`.
- `NOTES.md`: decision rules, the patterns used, the measurements, and what the model does not protect.

**Decisions**

1. For this domain, `vehicles`, `drivers`, `assignments`, `maintenanceEvents` and telemetry are separate collections. Only small, bounded one-to-one data is embedded.
2. The telemetry shape stays open between one document per reading, hourly buckets and a time series collection. It is decided with indexes and measurements in L3. Hand-built buckets are not assumed.
3. A maintenance event's copy of the vehicle plate is a snapshot (history), never synced.
4. No change to the FleetOps PostgreSQL schema.

**Deferred**

- The partial unique index for "one active assignment" and time series collections (L3).
- Upsert details (L4), `$unwind`/`$filter` over buckets (L5), multi-document transactions (L14), idempotent bucket writes for duplicate deliveries (L13).

### Learning Stage 3 — Indexing + query performance

**Status:** Planned

**Goal:** design indexes from access patterns and verify them with `explain()`.

**Topics:** single-field, compound, unique, TTL, multikey and geospatial indexes; `explain()` (`queryPlanner`, `executionStats`, `IXSCAN` vs `COLLSCAN`, keys vs documents examined); selectivity; the equality–sort–range rule for compound indexes; write overhead and index trade-offs; time series collections as an alternative to plain collections for telemetry.

**Exercises:** a synthetic telemetry collection (`organizationId`, `vehicleId`, `timestamp`, `location`, `speed`, `fuelLevel`) with enough documents for differences to show. Measure queries before and after indexes such as `{ organizationId: 1, vehicleId: 1, timestamp: -1 }`.

**Key question:** why does a telemetry workload (append-heavy, time-range reads) need different indexes from transactional FleetOps data?

### Learning Stage 4 — MongoDB querying

**Status:** Planned

**Goal:** write the queries a telemetry workload needs.

**Topics:** comparison and logical operators; array and nested document queries; `$in`, `$nin`, `$exists`, `$elemMatch`; update operators; atomic single-document updates; upserts; bulk operations (`bulkWrite`, ordered vs unordered).

**Exercises (fleet telemetry):** readings above a speed limit in a time range; vehicles with missing fuel level; upsert a "latest position" document per vehicle; bulk-insert a batch of readings and handle a partial failure.

### Learning Stage 5 — Aggregation pipeline

**Status:** Planned

**Goal:** understand why aggregation is useful for telemetry summaries.

**Topics:** `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`, `$set` / `$addFields`; date operators and time zones; averages, min/max; pipeline order and index use (`$match` first).

**Exercises:** average speed per vehicle per day; distance-related calculations from odometer readings; fuel statistics; readings per vehicle; activity per hour; idle-time analysis (engine on, speed 0).

### Learning Stage 6 — Geospatial features

**Status:** Planned

**Goal:** learn the location features that GPS tracking would need.

**Topics:** GeoJSON (`Point`, `Polygon`; coordinates are `[longitude, latitude]`); `2dsphere` indexes; `$near`, `$geoWithin`, `$geoNear`; nearby-vehicle queries; geofencing concepts (inside/outside a polygon, entry/exit as a change between two readings); location history.

Example document:

```json
{
  "organizationId": "…",
  "vehicleId": "…",
  "timestamp": "2026-10-05T08:30:00.000Z",
  "location": { "type": "Point", "coordinates": [31.2357, 30.0444] },
  "speed": 82,
  "fuelLevel": 61
}
```

**Not yet:** a GPS product, device integration, live tracking or real location data. This stage is for experimentation.

---

## Part B — Telemetry workload in NestJS (L7–L8)

### Learning Stage 7 — NestJS + MongoDB

**Status:** Planned

**Goal:** learn how MongoDB fits into a NestJS application, and how that differs from the Prisma setup.

**Topics:** connection management and lifecycle (connect, pool, graceful shutdown); driver vs ODM (official `mongodb` driver vs Mongoose via `@nestjs/mongoose`, chosen at this stage with a written reason); configuration through `ConfigService` and validated env vars; dependency injection; where a repository-style class helps and where it does not; index creation and management (application startup vs migration-style script); error handling (duplicate key, timeouts); testing (unit tests with mocks, integration tests against a real test database).

**Compare and document:**

| Topic               | PostgreSQL + Prisma (core)                          | MongoDB + driver/ODM (telemetry) |
| ------------------- | --------------------------------------------------- | -------------------------------- |
| Schema              | `schema.prisma` + migrations                        | To document                      |
| Types               | Generated client                                    | To document                      |
| Constraints         | Foreign keys, unique, check (in DB)                 | To document                      |
| Transactions        | Interactive transactions                            | To document                      |
| Data access pattern | `PrismaService` used directly in services           | To document                      |
| Tests               | Real database from `.env.test`, unique data per run | To document                      |

The existing conventions (e.g. "no repositories") are **not** copied automatically. Each one is re-evaluated for MongoDB, and any difference is written down with a reason.

**Open decision (made at L7, with approval):** where the telemetry code lives during L7–L8. Recommended: a `TelemetryModule` inside `apps/api/` that is **opt-in** (disabled unless its env vars are set), so the core still starts, tests and reports ready without MongoDB. This makes the L10 extraction a real lesson (module → service). The alternative is a separate learning application from the start, which skips that lesson.

**Not yet:** a second service, a broker, real devices.

### Learning Stage 8 — First telemetry prototype

**Status:** Planned

**Goal:** a working telemetry feature that shows what the MongoDB workload looks like in practice.

**Telemetry reading:** `organizationId`, `vehicleId`, `timestamp`, `location`, `speed`, `fuelLevel`, engine metrics, `odometer`.

**Capabilities:**

- Insert telemetry (single and batch).
- Retrieve telemetry.
- Query by vehicle, by organization (always scoped), by time range.
- Latest location per vehicle.
- Aggregated telemetry (e.g. daily averages).
- A basic geospatial query (vehicles near a point).

**Module boundary (prepares for L10):** the telemetry module does not import other feature modules' internals and does not touch PostgreSQL tables. Its only dependency on the core is one narrow question, "does this vehicle exist in this organization?", behind an interface. Tenant context comes from the existing JWT, as in the core.

**Still a single application.** No microservices yet. The purpose is to understand the workload first.

---

## Part C — Microservices (L9–L12)

### Learning Stage 9 — Microservices concepts

**Status:** Planned

**Goal:** understand microservices before building one, using telemetry as the main example.

**Topics:** monolith vs modular monolith vs microservices; service boundaries and bounded contexts; database per service; independent deployment and scaling; service ownership; API contracts and versioning; synchronous vs asynchronous communication; events and message brokers; eventual consistency; idempotency; retries, timeouts and circuit breakers; distributed transactions and the saga pattern; observability and correlation IDs.

**Exercise:** write the boundary of the telemetry context: what it owns, what it needs from the core, what the core needs from it, and what would go wrong if it were extracted today.

**Not yet:** splitting anything.

### Learning Stage 10 — Extract telemetry

**Status:** Planned

**Goal:** turn the telemetry module into an independently deployable service.

```text
Before                                   After

FleetOps (modular monolith)              FleetOps Core          Telemetry Service
├── core modules → PostgreSQL            NestJS + PostgreSQL    NestJS + MongoDB
└── TelemetryModule → MongoDB                  │                      │
                                               └──── API contract ────┘
```

**Questions this stage must answer and document:**

- Where the service lives in the monorepo (e.g. `apps/telemetry/`), with its own `package.json`, Dockerfile and CI job, like `apps/api/` and `apps/web/`.
- How it authenticates requests and gets tenant context (e.g. verifying the core's JWT with a shared or published key) without reading core tables.
- How it answers "does this vehicle exist in this organization?" now that it cannot call `VehiclesService` in-process.
- What happens to the core when the telemetry service is down (the core must keep working).

**Not extracted:** users, organizations, auth, vehicles, drivers, assignments, maintenance, fuel. Telemetry is first because its workload is different from the core, not to demonstrate microservices.

### Learning Stage 11 — Service-to-service communication

**Status:** Planned

**Goal:** learn synchronous and asynchronous communication between the core and telemetry.

Start synchronous, if it fits:

```text
FleetOps Core ──HTTP──→ Telemetry Service
```

Then asynchronous:

```text
FleetOps Core ──event──→ Message broker ──→ Telemetry Service
```

Example events: vehicle created / deleted (so telemetry keeps its own list of valid vehicles per organization), assignment started / ended (so telemetry can attribute readings to a driver).

**Broker choice is made here, not now.** Candidates to evaluate: RabbitMQ, Kafka, Redis Streams. A broker is added only when there is a clear learning reason, with a decision record (rule 7). Consider the transactional outbox pattern so that a core change and its event cannot get out of sync.

### Learning Stage 12 — Telemetry ingestion vs processing

**Status:** Planned

**Goal:** decide whether ingestion and processing should be separate services.

```text
                    ┌──────────────────────┐
                    │    FleetOps Core     │
                    │ NestJS + PostgreSQL  │
                    └──────────┬───────────┘
                               │ events / API
                               ↓
                    ┌──────────────────────┐
                    │ Telemetry Ingestion  │
                    └──────────┬───────────┘
                               ↓
                            MongoDB
                               ↓
                    ┌──────────────────────┐
                    │ Telemetry Processing │
                    └──────────────────────┘
```

Possible processing work: speed analysis, distance calculation, idle detection, fuel analysis, geofence events, daily vehicle statistics.

**Split only for a real reason** (e.g. ingestion must stay fast and available while processing is slow or bursty). If a background worker inside the telemetry service is enough, that is the answer, and it is documented as such. None of the services in the diagram are created automatically.

---

## Part D — Production concepts and the decision (L13–L15)

### Learning Stage 13 — Distributed systems problems

**Status:** Planned

**Goal:** experience real distributed-system problems on the telemetry architecture before adding production-grade infrastructure.

- **Reliability:** service unavailable, network failures, timeouts, retries, backoff, dead-letter queues.
- **Data consistency:** eventual consistency, duplicate events, out-of-order events, idempotency, at-least-once delivery.
- **Observability:** request ID and correlation ID across services (the core already has a request ID from Phase 8), structured logging, metrics, tracing, health checks.
- **Scaling:** horizontal scaling, stateless services, MongoDB scaling, consumer scaling, partitioning concepts.

**Exercises:** break things on purpose (stop the telemetry service, deliver an event twice, deliver events out of order) and show the system behaves correctly or fails clearly.

### Learning Stage 14 — MongoDB production concepts

**Status:** Planned

**Goal:** understand what running MongoDB in production involves.

**Topics:** connection pooling; deployment architecture; replica sets; read and write concerns; transactions (and why they need a replica set); backup and restore; TTL retention; monitoring and performance monitoring; data lifecycle, storage growth and archiving; scaling and sharding concepts (shard key choice for telemetry).

**Retention study:**

```text
Raw telemetry → kept N days (e.g. 30) → aggregated summaries → long-term retention
```

The numbers are examples. **No retention policy is implemented without real business requirements** (customer needs, legal and privacy obligations for driver location data, storage cost).

### Learning Stage 15 — PostgreSQL vs MongoDB architecture decision

**Status:** Planned

**Goal:** write an architecture decision record (ADR) comparing the two databases for FleetOps. Its file location (e.g. `docs/adr/`) is decided at this stage.

The ADR explains why FleetOps uses PostgreSQL for organizations, users, vehicles, drivers, assignments, maintenance and fuel, and evaluates whether MongoDB suits telemetry, GPS positions, high-volume time-series-like data, location history and vehicle events.

It compares against **real PostgreSQL alternatives too** (table partitioning, a time-series extension such as TimescaleDB, PostGIS for geospatial), because "add a second database" has a cost that "extend the one we have" does not.

Criteria: data structure; query patterns; write volume; read patterns; consistency requirements; transaction requirements; retention; scaling; cost; operational complexity (backups, monitoring, upgrades, skills for a second database).

**MongoDB is not assumed to be better.** The ADR is an engineering decision, not a conclusion carried over from the learning track.

---

## Connection to the product roadmap

The track feeds [**v2.x GPS + telematics**](product-roadmap.md#v2x--gps--telematics):

```text
MongoDB + microservices learning
                ↓
Telemetry prototype
                ↓
Microservices architecture (telemetry only)
                ↓
GPS / telematics product capability (v2.x)
```

> **The learning implementation does not automatically become the final production architecture.** The production architecture will be decided after validating actual product requirements, traffic, data volume and operational needs. The L15 ADR is input to that decision, not the decision itself.

---

## Master roadmap

```text
                         FLEETOPS
                            │
                            ↓
                   Backend development
                   Phase 1 → Phase 9
                            │
                            ↓
                Backend production ready
                            │
           ┌────────────────┴────────────────┐
           ↓                                 ↓
    Next.js frontend              MongoDB + microservices
     FE1 → FE9                     learning track
           │                                 │
           ↓                                 ↓
     FleetOps v1.0                  Telemetry prototype (L1–L8)
           │                                 │
           ↓                                 ↓
    Product roadmap                 Modular monolith first (L8)
    v1.1 → v1.4 → v2.0                       │
           │                                 ↓
           │                        Extract telemetry service (L10)
           │                                 │
           │                                 ↓
           │                        Service communication (L11)
           │                                 │
           │                                 ↓
           │                        Event-driven architecture (L11–L12)
           │                                 │
           │                                 ↓
           │                        Distributed systems learning (L13–L15)
           │                                 │
           └────────────────┬────────────────┘
                            ↓
                 GPS / telematics (v2.x)
                            │
                            ↓
                      FleetOps v2.x
```

The frontend and the learning track run in parallel. Neither blocks the other. v2.x needs both: the product foundation from the left branch and the telemetry knowledge from the right.

---

## Template for completed stages

```md
### Learning Stage N — <name>

**Status:** Planned | In progress | Done (`<commit>`)

**Goal:** <one sentence>

**What was learned**

- ...

**Built**

- ...

**Decisions**

- ...

**Deferred**

- ...
```
