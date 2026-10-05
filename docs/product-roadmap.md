# FleetOps — Product Roadmap

This file describes how FleetOps could grow from a portfolio project into a commercial B2B SaaS product. It is a **future product strategy and engineering direction, not part of the current implementation.** Nothing in it is built, and nothing in it is approved for building.

This roadmap starts only after:

1. Backend Phases 1–9 are complete ([`PHASES.md`](PHASES.md)).
2. Frontend Phases FE1–FE9 are complete ([`frontend-roadmap.md`](frontend-roadmap.md)).
3. FleetOps has reached a usable **v1.0** product.

The [MongoDB + microservices learning track](mongodb-microservices-track.md) is **not** a prerequisite for v1.0. It runs in parallel with the frontend and feeds v2.x GPS + telematics.

Every version below is directional. Before any version starts, its scope is validated (see "Principles"), confirmed with the user, and planned with `cto-esmail` the same way backend phases are. Technologies named here are candidates to evaluate at that time, not decisions.

| Version | Name                        | Status                                    |
| ------- | --------------------------- | ----------------------------------------- |
| v1.0    | Production fleet management | In progress (backend + frontend roadmaps) |
| v1.1    | SaaS monetization           | Future                                    |
| v1.2    | Automation + notifications  | Future                                    |
| v1.3    | Reports + analytics         | Future                                    |
| v1.4    | Enterprise features         | Future                                    |
| v2.0    | Fleet operations (trips)    | Future                                    |
| v2.x    | GPS + telematics            | Future, needs commercial validation       |
| v3.0    | Intelligence + AI           | Future, needs real operational data       |

---

## Principles

These apply to every version in this file.

### 1. Validate before building

A roadmap item is not automatically worth building. Before a version or feature starts, check:

- **Customer demand:** do real or prospective customers ask for it?
- **Business value:** does it help sell, retain or expand customers?
- **Implementation cost:** how much work, and what does it delay?
- **Operational complexity:** what new infrastructure, monitoring or on-call burden does it add?
- **Security implications:** does it add new data, new attack surface, or new tenant-isolation risk?

### 2. Do not over-engineer early

Do not introduce microservices, Kubernetes, event-driven architecture everywhere, complex ML systems or complex permission systems unless actual product requirements justify them. The modular monolith from the backend roadmap is the default for as long as it works. Microservices and MongoDB are explored in the [learning track](mongodb-microservices-track.md) on telemetry only; that track does not change this default for the core.

### 3. Keep the modular architecture

New features fit the existing NestJS structure: one feature module per domain, `PrismaService` used directly in services, DTOs for all input, conventions from `CLAUDE.md`. A new domain (billing, notifications, audit) is a new module, not code spread across existing ones.

### 4. Protect tenant isolation

Every future feature preserves organization isolation: tenant-owned tables carry `organizationId`, every query filters by it, uniqueness is tenant-scoped, and cross-tenant access returns `404`. This includes background jobs, webhooks, API keys, reports, exports and AI tools. Each one must know which organization it acts for.

### 5. Billing is a first-class domain

Subscription state, entitlements, usage limits and payment events live in their own module(s). Other modules ask "is this allowed?" through one entitlement interface. They never read plan names or payment status directly.

### 6. Background processing is explicit

Long-running or asynchronous work (emails, reports, webhook delivery, telemetry processing) does not run inside an HTTP request. It is queued or scheduled, retried safely, and observable.

### 7. Build based on real customer needs

This roadmap is re-evaluated after customer feedback and real usage. Versions may be reordered, merged, shrunk or dropped.

---

## v1.0 — Production fleet management

**Status:** In progress. Delivered by the backend roadmap (Phases 1–9) and the frontend roadmap (FE1–FE9).

**Goal:** a production-deployed, multi-tenant fleet management product that a small fleet can use every day.

This is the **baseline product before monetization.** It has no plans, limits or payments: every organization has every feature.

**Capabilities**

- Organizations (tenants) with strict data isolation.
- Authentication (JWT) with tenant context from the token.
- Users and roles (ADMIN, MANAGER, DRIVER).
- Vehicles.
- Drivers and vehicle assignments.
- Maintenance and fuel records, with per-vehicle cost summaries and service-due flags.
- Dashboard.
- API docs, unified error format, structured logging, login rate limiting.
- Docker, CI and production deployment for both the API and the web app.

**Known gaps to reconsider before v1.1** (recorded as out of scope in `PHASES.md` and `frontend-roadmap.md`): refresh tokens and token revocation, admin password reset, user invites, organization sign-up/onboarding, and fleet-wide statistics endpoints.

---

## v1.1 — SaaS monetization

**Goal:** organizations subscribe to a plan, and what they can use depends on that plan.

**Prerequisite:** self-service organization sign-up/onboarding, which v1.0 does not have. Without it, there is no customer to put on a trial.

### Subscription

- **Plans:** named plans (e.g. Starter, Business) with a price, billing interval and a set of entitlements. Plans are data, not code.
- **Organization subscription:** each organization has one current subscription linked to a plan.
- **Subscription status:** `trialing`, `active`, `past_due`, `canceled`, `expired` (final list decided at design time).
- **Trial period:** a new organization starts on a time-limited trial.
- **Lifecycle:** trial → active → (past due → grace period →) canceled or expired, with each transition recorded.
- **Upgrade:** takes effect immediately, prorated if the payment provider supports it.
- **Downgrade:** takes effect at the end of the period. If the organization is over the new plan's limits, existing data is kept, but new items are blocked until it is back within limits. Data is never deleted.
- **Cancellation:** at the end of the period, with read-only access afterwards for a defined time.
- **Grace period:** after a failed payment, full access continues for a defined number of days before restrictions apply.

### Usage limits and entitlements

Limits are expressed as **entitlements**: per-plan values such as:

- maximum vehicles, maximum drivers, maximum users;
- feature flags (e.g. reports, API access, audit logs).

One `EntitlementsService` (or similar) answers questions like "can this organization create another vehicle?" and "does this organization have feature X?". Feature modules call it at the point of action. No module hardcodes `if plan === 'starter'`, and limit numbers live in plan data, not in code.

Limit checks must stay correct under concurrent requests (e.g. two vehicles created at once at the limit). How that is enforced is decided at design time.

### Billing

- **Payment provider abstraction:** a small internal interface (create customer, start checkout, change plan, cancel, handle webhook) with one provider implementation behind it. The rest of the application depends on the interface, not the provider SDK. The provider (e.g. Stripe, Paddle, or a regional provider such as Paymob for Egyptian customers) is chosen at this version based on target markets, currencies and tax handling.
- **Checkout:** hosted checkout from the provider, so FleetOps never handles card data.
- **Subscription payments:** recurring charges handled by the provider.
- **Payment webhooks:** signature-verified, idempotent (each event processed once even if delivered twice), stored before processing, and processed in the background.
- **Failed payments:** move the subscription to `past_due`, start the grace period, notify the organization's admins (after v1.2, or with a minimal email in v1.1 if needed).
- **Billing history:** invoices and payments visible to organization admins.

**NestJS concepts:** a dedicated billing module, raw-body handling for webhook signatures, idempotency, guards or service-level checks for entitlements.

**Out of scope**

- Usage-based (metered) pricing, unless customers require it.
- Building an in-house invoicing or tax engine.

---

## v1.2 — Automation + notifications

**Goal:** FleetOps reminds people about things that need attention, without anyone checking manually.

**Planned features**

- **Notifications:** an in-app notification list per user.
- **Email notifications** through a transactional email provider behind a small interface.
- **Notification preferences:** per user, per notification type, per channel.
- **Notification templates:** maintained in one place, with variables (vehicle, driver, due date).
- **Reminders:** maintenance reminders, license expiration reminders, service-due reminders.

**Technical concepts**

- **Background jobs and queues:** sending email and generating reminders run outside HTTP requests, with retries and failure tracking. Candidate: Redis + BullMQ (`@nestjs/bullmq`).
- **Scheduled jobs:** daily or hourly scans for due items. Backend Phase 7 already introduces `@nestjs/schedule` for the service-due flag; v1.2 builds on it.
- **Event-driven workflows inside the monolith:** domain events (e.g. "maintenance record created") published with `@nestjs/event-emitter` and handled by the notifications module, so feature modules do not call email code directly.
- **Multi-instance safety:** once the API runs on more than one instance, a scheduled job must run once, not once per instance. A queue or a lock solves this; it is decided at this version.

**Decision point:** Redis is a new piece of infrastructure. Adopt it only when the volume or reliability needs justify it. A database-backed job table may be enough at first.

**Out of scope**

- SMS, WhatsApp and push notifications, unless customers require them.

---

## v1.3 — Reports + analytics

**Goal:** fleet managers understand where money and time go.

**Planned features**

- Fleet overview (extending the v1.0 dashboard).
- Vehicle cost analysis; fuel cost analysis; maintenance cost analysis.
- Monthly cost reports.
- Vehicle utilization (fully meaningful only with trip data from v2.0; until then, based on assignments).
- Driver statistics.
- Operational KPIs, such as cost per vehicle per month, overdue maintenance count and fuel cost trend.
- Exportable reports (CSV, then PDF if customers need it), generated in the background for large ranges.

**Approach**

- Each report answers a specific business question. A chart is added only when it shows a trend or comparison more clearly than a table.
- Aggregation queries in PostgreSQL first. Summary tables or materialized views only when queries become slow on real data.
- Reports are an entitlement (v1.1) if the plans require it.

**Out of scope**

- A custom report builder, a BI tool integration or a separate analytics database, unless real demand appears.

---

## v1.4 — Enterprise features

**Goal:** larger organizations can use FleetOps across locations, with accountability and integrations.

### Branches

An organization can have multiple branches:

```text
Organization
├── Cairo Branch
├── Giza Branch
└── Alexandria Branch
```

- Vehicles, drivers and users may belong to a branch.
- Users may be limited to their branch's data.
- **Design note:** branches live _inside_ a tenant. `organizationId` stays the isolation boundary; a branch is a filter within it, never a replacement for it. This is a schema change across several tables and needs careful migration planning.

### Audit logs

Record important actions with:

- who performed the action (user, or API key);
- what action it was;
- which resource changed;
- previous and new values (never secrets or password hashes);
- timestamp;
- IP address and user agent where appropriate.

Audit logs are tenant-scoped, append-only, readable by organization admins, and have a defined retention period.

### Advanced permissions

Move beyond the three fixed roles (e.g. custom roles, per-branch permissions) **only if real customer requirements justify it.** Any new model must keep the backend as the single place where permissions are checked.

### API keys

Organizations create API keys to integrate FleetOps with their own systems.

- Keys are tenant-scoped, shown once, stored hashed, revocable, and limited by scope.
- Requests with an API key are rate-limited and audit-logged.

### Webhooks

External systems receive FleetOps events (e.g. "vehicle assigned", "maintenance due").

- Payloads are signed, delivery is retried with backoff in the background, and delivery history is visible.
- Outgoing requests are protected against SSRF (no requests to internal addresses).

**Out of scope**

- SSO/SAML and SCIM provisioning, unless enterprise customers require them.

---

## v2.0 — Fleet operations

**Goal:** record what vehicles actually do, not only what they are. **Only after the core fleet management product is stable.**

### Trips

- Vehicle and driver.
- Origin and destination.
- Start and end time.
- Distance.
- Status (e.g. planned, in progress, completed, canceled).

Trips are entered manually or through the API in this version. Trip rules (e.g. a vehicle on an active trip must have an active assignment) are validated in the backend.

### Fleet utilization

Use trip data to calculate operational metrics such as distance per vehicle, active time per vehicle, and vehicles idle for a long time.

### Cost per trip

Combine:

- fuel;
- maintenance (allocated per distance or time);
- driver costs where applicable;
- other operational costs.

The allocation method is a product decision, made with customers.

**Out of scope**

- GPS and telemetry. They are not part of this version unless product requirements justify them.

---

## v2.x — GPS + telematics

**Status:** potential future direction. **Start only after the commercial need is validated** (customers willing to pay for it, and a hardware/device strategy).

**Potential features**

- GPS devices registered per vehicle.
- Vehicle location and live tracking.
- Telemetry ingestion.
- Driving history: speed, distance, idle time.
- Geofencing with entry/exit events.
- Driver behaviour (harsh braking, speeding).

**Architecture direction**

Telemetry is high-volume, continuous data and should not go through the request path of the main API:

```text
GPS / Device
    ↓
Telemetry API (ingestion)
    ↓
Event processing
    ↓
Queue
    ↓
FleetOps (trips, alerts, reports)
```

- Ingestion may become a separate service, because its scaling and availability needs differ from the main API. This is the first point where splitting out a service may be justified, and only for this workload.
- Storage for time-series data (e.g. MongoDB, PostgreSQL partitioning or a time-series extension) is decided based on real volume.
- Location data is personal data about drivers; retention, access control and privacy obligations are designed before collection starts.

**Input from the learning track**

The [MongoDB + microservices learning track](mongodb-microservices-track.md) prepares for this version:

```text
MongoDB + microservices learning
                ↓
Telemetry prototype
                ↓
Microservices architecture (telemetry only)
                ↓
GPS / telematics product capability
```

It provides a telemetry prototype, experience with service extraction and events, and an architecture decision record comparing PostgreSQL and MongoDB for telemetry (Learning Stage 15).

> The learning implementation does not automatically become the final production architecture. The production architecture will be decided after validating actual product requirements, traffic, data volume, and operational needs.

---

## v3.0 — Intelligence + AI

**Status:** potential future direction. Requires enough real operational data to be useful.

### AI fleet assistant

Users ask questions in plain language, for example:

- "Which vehicles cost the most this month?"
- "Which vehicles have overdue maintenance?"
- "Which driver licenses expire soon?"

**Rules**

- The assistant answers by calling **controlled application tools**: specific, typed, read-only service functions (e.g. "top vehicles by cost for a month") that already exist for the API.
- **An LLM never gets unrestricted direct database access** and never writes raw SQL against the database.
- Every tool call runs as the current user, in the current organization, with the same role checks as the API. The assistant cannot see more than the user can.
- Actions that change data (if ever added) require explicit user confirmation.
- Prompts, tool calls and answers are logged for audit, without storing secrets.

### Predictive maintenance

Potentially estimate:

- next maintenance date;
- maintenance risk;
- vehicle cost trends;
- abnormal fuel consumption.

Start with simple, explainable statistics (averages, thresholds, trends). Introduce ML models only after enough real operational data exists to train and validate them.

---

## Master development sequence

The order below is **intentional**. Within each track, every step depends on the one before it being complete, tested, reviewed and approved, and steps are not skipped. After backend Phase 9, two tracks run **in parallel**: the frontend roadmap and the MongoDB + microservices learning track. Neither blocks the other.

```text
Backend
   ↓
Phase 1 — Application foundation
   ↓
Phase 2 — PostgreSQL + Prisma
   ↓
Phase 3 — Authentication + tenant context
   ↓
Phase 4 — Vehicles API
   ↓
Phase 5 — Users + roles
   ↓
Phase 6 — Drivers + vehicle assignments
   ↓
Phase 7 — Maintenance + fuel records
   ↓
Phase 8 — API docs, logging + error format
   ↓
Phase 9 — Docker, CI + deployment
   ↓
Backend production ready
   │
   ├──────────────────────────────┐
   ↓                              ↓
Frontend roadmap (FE1 → FE9)   MongoDB + microservices learning track
   ↓                           (L1 → L15, see mongodb-microservices-track.md)
Frontend production ready         │
   ↓                              │
FleetOps v1.0                     │
   ↓                              │
Product roadmap                   │
   ↓                              │
v1.1 Monetization                 │
   ↓                              │
v1.2 Automation                   │
   ↓                              │
v1.3 Analytics                    │
   ↓                              │
v1.4 Enterprise                   │
   ↓                              │
v2.0 Fleet operations             │
   ↓                              │
v2.x GPS + telematics  ←──────────┘
   ↓
v3.0 AI / intelligence
```

Why this order:

- **Backend before frontend:** the frontend consumes a finished, documented and deployed API instead of a moving target.
- **Learning track in parallel, not in the v1.0 path:** it teaches MongoDB and microservices on telemetry without delaying the product or changing the core. Its results are input to v2.x, not a prerequisite for anything earlier.
- **v1.0 before monetization:** there must be a product worth paying for before adding plans and billing.
- **Monetization before automation, analytics and enterprise:** later features can then be offered as plan entitlements.
- **Enterprise before fleet operations:** audit logs, API keys and webhooks make trips and telematics safer to integrate.
- **Telematics and AI last:** they have the highest cost and complexity, and they depend on real customers and real data.

At the time of writing, backend Phases 1–9 are done, Frontend Phase 1 is done, and the learning track has not started.
