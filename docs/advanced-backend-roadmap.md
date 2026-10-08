# FleetOps — Advanced Backend Engineering Track

This file plans a second **learning track**. It teaches production backend engineering (caching, messaging, real-time, geospatial, integration, search, observability, resilience, orchestration) through real FleetOps features. It is **not** a continuation of the backend phases, which end at Phase 10 (Vehicle master data). It is also not part of the MongoDB + microservices track, which stays L1–L15.

Nothing in this file is built yet. Every stage is a plan, started only with the user's approval.

Related documents:

- [`PHASES.md`](PHASES.md): the backend roadmap (Phases 1–9). The FleetOps core.
- [`frontend-roadmap.md`](frontend-roadmap.md): the Next.js frontend (FE1–FE9).
- [`mongodb-microservices-track.md`](mongodb-microservices-track.md): the MongoDB + microservices learning track (L1–L15). **This track starts after it.**
- [`product-roadmap.md`](product-roadmap.md): product versions. This track produces candidates for v1.x and v2.x, not commitments.
- `CLAUDE.md`: conventions for the existing API. They still apply to any code this track adds.

To avoid confusion with the other roadmaps, stages are always called **Advanced Stage N** (A1–A12). "Phase N" means a backend phase, "FE N" a frontend phase, and "Learning Stage N" (L1–L15) a stage of the MongoDB track. The parts of this track use Roman numerals (Part I–IV) so they are not confused with the lettered parts (A–D) of the MongoDB track.

| Stage | Name                                     | Part                     | Status  | Commit(s) |
| ----- | ---------------------------------------- | ------------------------ | ------- | --------- |
| A1    | Redis and distributed caching            | I: Data + messaging      | Planned | —         |
| A2    | Message broker + event-driven core       | I: Data + messaging      | Planned | —         |
| A3    | Outbox pattern                           | I: Data + messaging      | Planned | —         |
| A4    | Observability and distributed tracing    | I: Data + messaging      | Planned | —         |
| A5    | Real-time vehicle tracking               | II: Location + real time | Planned | —         |
| A6    | Maps and geospatial fleet features       | II: Location + real time | Planned | —         |
| A7    | Geofencing and location events           | II: Location + real time | Planned | —         |
| A8    | Notification system                      | III: Integration         | Planned | —         |
| A9    | ERP / enterprise integration             | III: Integration         | Planned | —         |
| A10   | Search engine (evaluate before adopting) | III: Integration         | Planned | —         |
| A11   | Reliability and resilience               | IV: Production           | Planned | —         |
| A12   | Kubernetes and production scaling        | IV: Production           | Planned | —         |

---

## Where this track sits

```text
FleetOps
│
├── Backend
│   └── Phase 1 → Phase 9
│
├── Frontend
│   └── FE1 → FE9
│
├── MongoDB + Microservices Learning
│   └── L1 → L15
│
└── Advanced Backend Engineering
    └── A1 → A12
```

```text
Backend Core
Phase 1–9
      │
      ├───────────────┐
      │               │
      ▼               ▼
Frontend          MongoDB + Microservices
FE1–FE9              L1–L15
                        │
                        ▼
              Advanced Backend Engineering
                      A1–A12
                        │
                        ▼
                 FleetOps v2.x+
```

- **Entry gate: L15 is done.** The track assumes what the MongoDB track produced: a telemetry service (L10), service-to-service communication and a chosen broker (L11), the ingestion/processing decision (L12), correlation IDs and basic failure handling (L13), and the database ADR (L15). If those outcomes differ from the plan, each affected stage is re-scoped before it starts.
- **The frontend does not depend on this track.** FE1–FE9 and FleetOps v1.0 never wait for it.
- **Some stages need the frontend.** A5, A6, A7 and A8 include UI work (live map, geofence editor, notification list). That work needs FE9 to be done. It is done inside the stage by `fe-dev-ahmed` under [`apps/web/CLAUDE.md`](../apps/web/CLAUDE.md) and recorded here. It is not an FE10.
- **The product does not depend on this track.** Product versions are validated and approved on their own (see "Connection to the product roadmap").

---

## Why this order

A1–A12 follows the original proposal with one change: **observability moves from A10 to A4.**

- From A2 on, one fleet event crosses several processes: core → outbox relay → broker → telemetry service or consumer. The correlation IDs from L13 only appear in logs, and they cannot show latency per hop or queue time.
- Every later stage has a "Measure" step (real-time fan-out latency, notification delivery time, ERP sync lag, search indexing lag). Without metrics and traces, those steps rely on guesses.
- Trace context must travel inside outbox rows and broker messages. It is cheaper to add that right after A3 than to retrofit it into six stages.

The other stages keep their order and only shift by one. No proposed topic was merged or dropped:

- **Messaging comes before everything event-based.** A2 and A3 are the backbone that A5, A7, A8, A9 and A10 consume.
- **Location stages form a chain.** Live positions (A5), then a map to show them (A6), then geofences drawn on that map and evaluated on that stream (A7).
- **Notifications come after their event sources.** Maintenance, assignment and geofence events (A3, A7) and the real-time channel (A5) must exist first.
- **Search (A10) is conditional.** The stage may end with "PostgreSQL is enough", and that is a valid result.
- **Resilience and Kubernetes come last.** They need the full set of failure points and deployable units to be meaningful.

A9 and A10 depend only on A3 and A4. If product priorities change, they can move before A5 with the user's approval.

---

## Architecture principles

These apply to every stage.

1. **No technology without a FleetOps problem.** Each stage names the concrete problem first. "Add Redis demo" is rejected; "cache an expensive fleet summary and measure the effect" is accepted.
2. **The core stays a modular monolith.** Users, organizations, auth, vehicles, drivers, assignments, maintenance and fuel stay in `apps/api/`. New capabilities (notifications, integrations, geofences) start as **modules**.
3. **Telemetry stays the only extracted service** unless a stage proves otherwise with a decision record (a different workload, scaling need or availability need). "We now have a broker" is not a reason to extract anything.
4. **A service owns its data.** No two services share tables, collections or indexes. Cross-service data travels through APIs or events.
5. **Learn through real features.** Every stage changes something a fleet manager could use, then measures it.
6. **Infrastructure follows the problem.** Each piece is added only when its stage starts, with a decision record:

   | Infrastructure                     | Earliest stage | Note                                                  |
   | ---------------------------------- | -------------- | ----------------------------------------------------- |
   | Redis                              | A1             | Not added anywhere else before A1.                    |
   | Message broker                     | L11            | Already chosen in L11. A2 reuses it, or re-evaluates. |
   | Metrics, trace backend, dashboards | A4             | Local compose only, unless a deploy target exists.    |
   | Map provider / tiles               | A6             | Chosen in A6.                                         |
   | Email provider                     | A8             | Chosen in A8.                                         |
   | Mock ERP                           | A9             | A simulated system, not a real vendor.                |
   | Search engine                      | A10            | Only if the stage shows PostgreSQL is not enough.     |
   | Kubernetes (local cluster first)   | A12            | Managed databases and brokers stay outside.           |

7. **Every stage is incremental:**

   ```text
   Learn → Design → Small implementation → Test → Measure
         → Architecture review → Document → Commit → Next stage
   ```

Rules that carry over from the core and the MongoDB track and are not relaxed for learning code:

- **Tenant isolation everywhere.** Cache keys, topics or routing keys, WebSocket rooms, search indexes, notification records, ERP mappings and metrics labels all carry the organization. Cross-tenant access returns `404`. Background consumers know which organization they act for.
- **Location data is personal data about drivers.** Only synthetic data is used unless the user explicitly approves otherwise.
- **No secrets in code or commits**, including Redis/broker URLs, map API keys, email provider keys and ERP credentials.
- **Existing behavior is preserved.** A stage that changes an existing endpoint, schema or module explains why and gets approval.

---

## Learning workflow

Same loop and the same agent flow as the MongoDB track:

- **One stage at a time.** Never implement several stages at once, or part of a later stage early.
- **Before a stage starts**, the main conversation presents:
  1. what will be learned;
  2. why it matters;
  3. the FleetOps problem it solves, and how it will be measured;
  4. new infrastructure or dependencies, and their decision record;
  5. what will **not** be implemented yet;

  and **asks the user for approval** before any implementation.

- `cto-esmail` plans, `be-dev-abdel-aziz` implements, `qa-dev-abdel-rahman` writes the tests, `cto-esmail` reviews. UI work in A5–A8 goes to `fe-dev-ahmed`.
- The Definition of Done in `CLAUDE.md` applies to every stage that touches `apps/api/`. The stage also adds whatever its new services need (their own lint, tests and CI job).
- Decision records live where L15 decides (for example `docs/adr/`).

### Working rules for Claude Code

- Do not silently implement future stages.
- Do not install dependencies or add infrastructure (Redis, broker clients, OpenTelemetry, map libraries, search engines, Kubernetes tooling) without approval.
- Do not change the PostgreSQL or MongoDB schema unless the stage requires it and the user approves.
- Do not convert core modules into services.
- Update this file when a stage is done (status, commit, what was learned and built, decisions, measurements, deferred items).
- Commit each stage separately.

### Stage completion report

```text
Stage:
Status:

What I learned:

What I implemented:

Measurements (before / after):

Architecture decisions:

Infrastructure added:

Files changed:

Tests:

Deferred:

Commit:
```

---

## Part I — Data + messaging (A1–A4)

### Advanced Stage 1 — Redis and distributed caching

**Status:** Planned

**Prerequisites:** L15 done (track entry gate). Technically depends only on the core (Phase 9).

**Goal:** introduce Redis where FleetOps has a real multi-instance problem, and nowhere else.

**Why:** with more than one API instance, per-process state is wrong or wasted. FleetOps already has documented cases of this:

- Rate limits are in memory, so with N instances the effective login limit is up to N times higher. This was deferred in Phases 8 and 9.
- Repeated reads of fleet summaries recompute the same aggregates per request. These are `GET /dashboard` and the cost summaries.

**Topics:** Redis data types and persistence options; cache-aside; TTL vs explicit invalidation; tenant-scoped key design; cache stampede (request coalescing, jittered TTL, early refresh); distributed locks and their limits; rate limiting with shared counters; idempotency keys. Redis Streams are evaluated in A2, not here.

**FleetOps applications** (the stage picks the ones that measure as worthwhile):

| Use case                                         | Why it may be worth it                                                     | Must also answer                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Redis storage for the login/password throttler   | Fixes a known deferred bug: per-instance limits.                           | What happens when Redis is down (fail open or closed)?                     |
| Cache the fleet dashboard / fleet cost summaries | Read-heavy, several aggregates per call.                                   | Is it slow on a realistic large organization? Invalidated on which writes? |
| `Idempotency-Key` on a create endpoint           | A retried `POST` for a fuel log or maintenance record double-counts costs. | Redis (with TTL) vs a PostgreSQL table (durable)?                          |
| Distributed lock comparison                      | `ServiceStatusJob` already uses a PostgreSQL advisory lock (Phase 9).      | Keep the advisory lock unless Redis is clearly better. Document why.       |

**Measure:** latency and database query count before and after, on a seeded large organization. If caching does not help, record that and do not ship it.

**Not in this stage:** caching every endpoint, a cache in front of writes, Redis as a primary store, Redis Streams, job queues (BullMQ).

### Advanced Stage 2 — Message broker + event-driven core

**Status:** Planned

**Prerequisites:** A1; L11 (broker chosen and used between core and telemetry); L13 (duplicate and out-of-order events experienced).

**Goal:** publish FleetOps core domain events and consume them asynchronously, with correct at-least-once handling.

**Why:** L11 used a broker for a few core → telemetry events. Notifications, integrations and search indexing (A8–A10) all react to core changes. Calling them inside the request path couples modules and slows writes.

**Broker:** L11 already chose one (candidates were RabbitMQ, Kafka and Redis Streams). A2 **reuses that choice** unless the wider workload changes the answer. If it does, it re-evaluates against: delivery guarantees, ordering needs (per vehicle), replay needs, consumer groups, operational cost, NestJS support, and learning value. The result is a decision record either way.

**Events (candidates):** `VehicleCreated`, `VehicleDeleted`, `DriverAssigned`, `AssignmentEnded`, `MaintenanceCompleted`, `FuelRecorded`.

**Topics:** producer, consumer, queue vs topic, consumer groups, acknowledgement, retry, dead-letter queue, idempotent consumers (processed-event tracking), ordering scope (per vehicle, not global), at-least-once delivery, eventual consistency, event schema and versioning, tenant identity inside every event.

**Deliberate gap:** in this stage the core writes to PostgreSQL and then publishes. The stage **demonstrates** the dual-write failure (commit succeeds, publish fails, and the reverse). A3 fixes it. A2 code is not considered production-ready until A3.

**Not in this stage:** the outbox, event sourcing, CQRS, splitting core modules into services.

### Advanced Stage 3 — Outbox pattern

**Status:** Planned

**Prerequisites:** A2.

**Goal:** make "change the data" and "publish the event" consistent.

```text
PostgreSQL transaction
        │
        ├── update domain data
        │
        └── insert outbox event
                    │
                    ▼
              Event publisher (relay)
                    │
                    ▼
               Message broker
```

**Compare:**

| Approach                                  | Failure                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| DB update, then publish                   | Commit OK + publish fails → event lost. Publish OK + rollback → phantom event. |
| DB transaction + outbox row + async relay | Event delayed, never lost; may be published twice → consumers dedupe (A2).     |

**Topics:** the outbox table (tenant-owned, `organizationId`, snake_case, UUIDv7, a migration); writing it in the same interactive transaction as the domain change (the pattern Phase 7 already uses for maintenance); relay options (polling with `FOR UPDATE SKIP LOCKED` vs change data capture), chosen with a reason; running the relay safely on several instances; ordering per aggregate; retention and cleanup of published rows; the inbox pattern on the consumer side; carrying correlation and trace context inside the row.

**Failure scenarios to reproduce:** relay crash mid-batch, broker down for minutes, duplicate publish, poison message, slow consumer.

**Not in this stage:** CDC infrastructure (e.g. Debezium) unless polling is shown to be insufficient.

### Advanced Stage 4 — Observability and distributed tracing

**Status:** Planned

**Prerequisites:** A3 (asynchronous hops exist); L13 (correlation IDs and structured logs).

**Goal:** follow one request or event across the system and measure each hop.

```text
Next.js → Core API → Outbox relay → Message broker → Telemetry Service → MongoDB
```

**Topics:** the three signals (logs, metrics, traces); OpenTelemetry instrumentation for HTTP, Prisma, the broker and MongoDB; trace context propagation through Next.js server calls, outbox rows and broker headers; the request ID in service logs (deferred since Phase 8, needs AsyncLocalStorage); RED metrics (rate, errors, duration) per service; queue depth and consumer lag; database latency; health checks vs readiness (the core already has `/health/live` and `/health/ready`); sampling; label cardinality (do **not** use `organizationId` as a metrics label without a reason); keeping personal data out of telemetry signals.

**Candidates to evaluate:** OpenTelemetry SDK + Collector, Prometheus, Grafana, Jaeger or Tempo. They run in local compose. A hosted option is considered only together with a real deploy target.

**Not in this stage:** alerting rules and on-call (A11), autoscaling on metrics (A12).

---

## Part II — Location + real time (A5–A7)

All location data is synthetic. A small simulator that drives vehicles along routes is acceptable learning tooling.

### Advanced Stage 5 — Real-time vehicle tracking

**Status:** Planned

**Prerequisites:** A2 and A4; L10–L12 (telemetry service and its ingestion/processing shape); FE9 done (for the UI).

**Goal:** fleet managers see vehicle positions update live.

```text
Telemetry → Telemetry Service → event / real-time layer → Next.js → live fleet view
```

**Topics:** WebSockets vs Server-Sent Events (live tracking is mostly one way); connection lifecycle; rooms per organization (and per vehicle for a selected vehicle); broadcasting and fan-out across several gateway instances (a broker or Redis pub/sub adapter); reconnect and resume (send the latest state on reconnect, not the full history); stale connections and heartbeats; backpressure and throttling updates per vehicle; real-time authorization and tenant isolation (a client never joins another organization's room).

**Open decisions (made at A5, with approval):**

- **How it fits the backend-for-frontend design.** The browser never calls the API directly and never sees the access token (frontend roadmap, "Server-side API access"). The options:
  - SSE proxied through a Next.js Route Handler that holds the session.
  - A short-lived, single-use connection ticket issued by the Next.js server for a direct WebSocket.
  - Another option that keeps the token out of browser JavaScript.

  Also check what long-lived connections require from the web deployment.

- **Where the real-time gateway lives.** In the telemetry service (it owns the positions) or a separate gateway. It does not live in the core.

**Frontend:** a vehicle list with location, speed, status, last update, the selected vehicle and live movement. A map comes in A6. A5 may start with a table to keep the stages separate.

**Not in this stage:** maps, route history, geofences, notifications.

### Advanced Stage 6 — Maps and geospatial fleet features

**Status:** Planned

**Prerequisites:** A5; L6 (GeoJSON, `2dsphere`, `$near`, `$geoWithin`).

**Goal:** show the fleet on a map and query it spatially.

**Features (candidates):** live vehicle locations on a map; route history for a vehicle and time range; route playback; nearby vehicles to a point.

**Topics:** provider evaluation; tiles and attribution; marker clustering for large fleets; downsampling route history for display (do not send every reading); time-range queries against the telemetry store; client vs server responsibility for spatial work.

**Provider evaluation (decided at A6):**

| Criterion           | Mapbox | Google Maps | OpenStreetMap + Leaflet (or MapLibre) |
| ------------------- | ------ | ----------- | ------------------------------------- |
| Pricing / free tier | —      | —           | —                                     |
| API limits          | —      | —           | —                                     |
| Next.js support     | —      | —           | —                                     |
| Geospatial features | —      | —           | —                                     |
| Learning value      | —      | —           | —                                     |
| Production concerns | —      | —           | —                                     |

The table is filled in at the stage with current information. Nothing is chosen now. Map API keys are secrets, or are public keys restricted by domain.

**Not in this stage:** geofences, routing/directions, address geocoding (unless the stage justifies it).

### Advanced Stage 7 — Geofencing and location events

**Status:** Planned

**Prerequisites:** A6 (geofences are drawn and shown on the map); A3 (reliable events); L12 (where processing runs).

**Goal:** detect when a vehicle enters or leaves an area and emit an event.

```text
Vehicle position → geofence check → ENTER / EXIT → VehicleEnteredGeofence / VehicleExitedGeofence
```

**Topics:** GeoJSON polygons (and their validation); spatial queries; detection as a **state change** between consecutive positions (per vehicle, per geofence); keeping the last known inside/outside state; duplicate event prevention (idempotent detection under at-least-once delivery); out-of-order and late readings; GPS jitter at the boundary (dwell time or hysteresis); real-time push of geofence events through the A5 channel.

**Open decision (made at A7):** who owns geofence definitions. Either the telemetry service (needed at detection time, location-related data), or the core with a copy kept in telemetry through events. Either way, one owner, with no shared tables (principle 4).

**Not in this stage:** notifications for geofence events (A8), routing rules, driver behaviour scoring.

---

## Part III — Integration (A8–A10)

### Advanced Stage 8 — Notification system

**Status:** Planned

**Prerequisites:** A3 (reliable domain events); A5 (real-time channel); A7 (location events); FE9 done (for the in-app list).

**Goal:** turn domain events into notifications that people receive and can control.

```text
Domain event → broker → notifications module → in-app / real-time / email
```

**It is a module in the core, not a new service.** Product v1.2 plans notifications inside the monolith, and principle 3 applies. Extraction needs its own decision record.

**Notifications (candidates):** maintenance due, vehicle entered a restricted area, vehicle left a geofence, abnormal fuel consumption, assignment changes.

**Topics:** event → notification mapping; per-user preferences (type × channel); templates; recipient resolution by role and organization; delivery status per channel; retry with backoff; failure handling and dead letters; idempotency (one event, one notification per recipient); rate limiting and digesting noisy alerts; email provider selection (decided here, behind a small interface); background delivery (broker consumer vs a job queue such as BullMQ on the A1 Redis, decided with a reason).

**Relationship to product v1.2:** if v1.2 is approved and built first, A8 extends that module instead of building a second one.

**Not in this stage:** SMS, WhatsApp, mobile push.

### Advanced Stage 9 — ERP / enterprise integration

**Status:** Planned

**Prerequisites:** A3 (outbound changes come from the outbox); A4 (tracing across the integration); A1 (idempotency keys).

**Goal:** learn enterprise integration patterns against a **simulated ERP**.

**Integration areas (candidates, the stage picks one or two):** employees ↔ drivers, assets ↔ vehicles, vendors, purchase orders, maintenance invoices, fuel expenses.

**Topics:** external REST API contracts (a mock ERP with an OpenAPI contract); authentication with API keys and OAuth2 client credentials; inbound webhooks (signature verification, idempotent processing, stored before processing); outbound synchronization from domain events; mapping external and internal models (an anti-corruption layer and an external-ID mapping table per organization); timeouts, retries and backoff; partial failure; reconciliation jobs that detect and repair drift; a per-organization integration configuration with secrets stored encrypted.

**Relationship to product v1.4:** v1.4 plans API keys and outgoing webhooks. A9 reuses those designs where they exist, and adds what they need.

**Not in this stage:** a real ERP vendor, a generic integration platform, multiple ERPs.

### Advanced Stage 10 — Search engine (evaluate before adopting)

**Status:** Planned

**Prerequisites:** A3 (index updates come from events); A4 (indexing lag and query latency are measured).

**Goal:** decide, with measurements, whether FleetOps needs a search engine, and build the search that the evidence supports.

**Use case:** one fleet search across vehicles, drivers, maintenance, fuel and possibly telemetry events, with typo tolerance and autocomplete.

**Step 1 — baseline in the existing databases:** PostgreSQL full-text search and `pg_trgm` on a large synthetic organization (all queries tenant-scoped). This is a real candidate, not a straw man.

**Step 2 — only if the baseline fails a defined requirement:** Elasticsearch or OpenSearch (licensing, hosting, cost and client support compared), with indexing, analyzers, filters, relevance, autocomplete and aggregations. The index is fed from domain events (A2/A3) with full reindex and backfill. Tenant isolation lives in the index and in every query.

**Valid outcomes:** "PostgreSQL search is enough". The ADR and the PostgreSQL implementation then complete the stage, with no new infrastructure. Or "a search engine is justified for X".

**Not in this stage:** search over raw telemetry readings without a demonstrated need.

---

## Part IV — Production (A11–A12)

### Advanced Stage 11 — Reliability and resilience

**Status:** Planned

**Prerequisites:** A2–A10 (the real failure points exist); L13 (basic retries and failure exercises).

**Goal:** the system degrades gracefully and recovers on its own, proven with controlled failures.

L13 introduced timeouts, retries and dead letters on the core → telemetry path. A11 applies resilience **systematically** to every dependency added since, and only where it solves a demonstrated problem.

**Topics:** timeout budgets per call; retry with exponential backoff and jitter (and when not to retry); circuit breakers (ERP, email provider, map provider, telemetry service); bulkheads (separate pools or consumers, so a slow integration cannot starve core requests); dead-letter handling and replay tools; idempotency audit; graceful degradation (cached or stale data, features turned off); liveness vs readiness for each service; graceful shutdown (draining connections and consumers); alerting on the A4 signals.

**Failure scenarios (examples):**

```text
Telemetry Service DOWN   → core CRUD, dashboard and costs keep working; live map shows "stale"
Broker DOWN              → outbox grows; nothing is lost; relay catches up
Redis DOWN               → cache bypassed; throttler fails as decided in A1
ERP slow / DOWN          → circuit opens; sync retried later; reconciliation repairs drift
Email provider DOWN      → notifications queued; in-app still delivered
```

**Not in this stage:** multi-region failover, chaos tooling beyond what the scenarios need.

### Advanced Stage 12 — Kubernetes and production scaling

**Status:** Planned

**Prerequisites:** A11 (probes, graceful shutdown, stateless services); A4 (metrics for scaling decisions). Phase 9 left Kubernetes out of scope; this stage is where it is considered.

**Goal:** run FleetOps' deployable units on Kubernetes and scale them independently, with the reason recorded.

```text
                    Kubernetes
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    Core API        Telemetry        Workers (relay, consumers)
        │              │
        ▼              ▼
   PostgreSQL       MongoDB
        │
        └──── Redis / Broker
```

**Topics:** Deployment, Service, ConfigMap, Secret; readiness and liveness probes (mapped to the existing `/health/live` and `/health/ready`); resource requests and limits; horizontal scaling (and why the outbox relay and the scheduled job need locks or leader election); rolling deployments with migrations kept as a separate release step (Phase 9 decision 3); service discovery; a local cluster first (kind, k3d or minikube).

**Must document:** what stays **managed infrastructure** outside the cluster. By default that is PostgreSQL, MongoDB, the broker and Redis, unless there is a reason otherwise. Also document whether Kubernetes is justified for FleetOps' real size, versus a simpler platform.

**Not in this stage:** service mesh, multi-cluster, GitOps tooling, an actual production cluster without approval.

---

## Stage dependencies

Stages run in numeric order, one at a time. The table shows the real dependencies, so a reorder can be judged later.

| Stage | Depends on                        | Uses from earlier tracks          |
| ----- | --------------------------------- | --------------------------------- |
| A1    | — (track gate: L15 done)          | Phases 8–9 (throttler, lock)      |
| A2    | A1 (only if Redis Streams chosen) | L11 broker, L13                   |
| A3    | A2                                | Phase 7 transaction pattern       |
| A4    | A3                                | L13 correlation IDs, Phase 8 logs |
| A5    | A2, A4                            | L10–L12 telemetry service; FE9    |
| A6    | A5                                | L6 geospatial                     |
| A7    | A3, A6                            | L6, L12                           |
| A8    | A3, A5, A7                        | FE9; product v1.2 design          |
| A9    | A1, A3, A4                        | Product v1.4 design               |
| A10   | A3, A4                            | —                                 |
| A11   | A2–A10                            | L13                               |
| A12   | A4, A11                           | Phase 9 Docker + health probes    |

```text
L15 done
   │
   ▼
A1 Redis → A2 Broker + events → A3 Outbox → A4 Observability
                                                  │
                     ┌────────────────────────────┼──────────────┐
                     ▼                            ▼              ▼
             A5 Real-time tracking           A9 ERP        A10 Search
                     │
                     ▼
               A6 Maps
                     │
                     ▼
            A7 Geofencing
                     │
                     ▼
           A8 Notifications
                     │
       (all of the above)
                     ▼
            A11 Reliability
                     │
                     ▼
            A12 Kubernetes
```

---

## Connection to the product roadmap

Each stage produces **knowledge and a validated option** for a product capability. **None of these is a committed product feature.** Product versions are validated (demand, value, cost, operations, security) and approved separately, as [`product-roadmap.md`](product-roadmap.md) requires.

| Stage | Capability candidate                                 | Product version it could inform |
| ----- | ---------------------------------------------------- | ------------------------------- |
| A1    | Fast fleet dashboards; correct multi-instance limits | v1.0 hardening, v1.3            |
| A2    | Domain events, asynchronous workflows                | v1.2, v1.4                      |
| A3    | Reliable events for webhooks and integrations        | v1.4                            |
| A4    | Production observability                             | All versions                    |
| A5    | Live fleet tracking                                  | v2.x                            |
| A6    | Vehicle map, route history and playback              | v2.x                            |
| A7    | Location-based alerts                                | v2.x                            |
| A8    | Maintenance and location alerts                      | v1.2, v2.x                      |
| A9    | Enterprise fleet operations (ERP sync)               | v1.4                            |
| A10   | Large-fleet search                                   | v1.3, v1.4                      |
| A11   | Production reliability                               | All versions                    |
| A12   | Independent scaling                                  | v2.x                            |

> As with the MongoDB track, **the learning implementation does not automatically become the production architecture.** Each product version decides its architecture from real requirements, traffic, data volume and operational needs, using the stage's decision records as input.

---

## Template for completed stages

```md
### Advanced Stage N — <name>

**Status:** Planned | In progress | Done (`<commit>`)

**Goal:** <one sentence>

**What was learned**

- ...

**Built**

- ...

**Measurements**

- ...

**Decisions**

- ...

**Deferred**

- ...
```
