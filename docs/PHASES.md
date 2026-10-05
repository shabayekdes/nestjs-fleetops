# FleetOps API — Phase Roadmap

FleetOps is built in phases, partly as a way to learn NestJS. This file records what each phase delivered, the decisions it made, and what it deliberately left out. Use it as context before planning a new phase.

This file covers the backend only. The web frontend is planned in [`frontend-roadmap.md`](frontend-roadmap.md) and starts only after Phase 9. Product versions after v1.0 are in [`product-roadmap.md`](product-roadmap.md).

Rules for working with phases:

- Build only the current phase. Do not implement anything listed under a later phase or under "Out of scope" without the user's approval.
- When a phase is finished, update its entry here: set the status, list what was built, and record its decisions and deferred items.
- Conventions live in `CLAUDE.md`. This file covers scope and history only.
- Planned phases are a direction, not a spec. Before starting one, confirm its scope with the user, then ask `cto-esmail` for a plan. The order and content of planned phases may change.

| Phase | Name                             | Status | Commit(s) |
| ----- | -------------------------------- | ------ | --------- |
| 1     | Application foundation           | Done   | `4b1d372` |
| 2     | PostgreSQL + Prisma              | Done   | `5623cff` |
| 3     | Authentication + tenant context  | Done   | `0195815` |
| 4     | Vehicles API                     | Done   | `9e4a426` |
| 5     | Users + roles                    | Done   | `c80e806` |
| 6     | Drivers + vehicle assignments    | Done   | `961d586` |
| 7     | Maintenance + fuel records       | Done   | `f12eeed` |
| 8     | API docs, logging + error format | Done   | `2395d09` |
| 9     | Docker, CI + deployment          | Done   | —         |

---

## Phase 1 — Application foundation

**Status:** Done (`4b1d372`)

**Goal:** a running NestJS app with the global HTTP setup, configuration and test tooling that every later phase relies on.

**Built**

- NestJS 12 scaffold: native ESM, strict TypeScript, Express adapter.
- `src/app.setup.ts` (`configureApp`): `/api` prefix, URI versioning with default `v1`, global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform). Used by both `main.ts` and e2e tests.
- `@nestjs/config` with startup validation in `src/config/env.validation.ts` (`NODE_ENV`, `PORT`).
- `GET /api/v1` (root) and `HealthModule` with `GET /api/v1/health`.
- Jest in native ESM mode instead of the scaffolded Vitest; ESLint + Prettier instead of oxlint.
- Unit tests and e2e tests, README, `.env.example`.

**Decisions**

- Global HTTP config lives in one function so e2e tests run the same app as production.
- The app refuses to start with invalid env vars.

---

## Phase 2 — PostgreSQL + Prisma

**Status:** Done (`5623cff`)

**Goal:** a database layer and the first data model, with no business endpoints yet.

**Built**

- Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg` driver adapter; `prisma.config.ts`.
- `DatabaseModule` + `PrismaService` in `src/database/`. Startup runs `SELECT 1` and the app exits if the database is unreachable; disconnects cleanly on shutdown.
- Models in `prisma/schema.prisma`, initial migration `20261001143906_init`:
  - `Organization` (tenant): `name`, globally unique `slug`.
  - `User`: belongs to an organization; `firstName`, `lastName`, lowercase `email`, Argon2id `passwordHash`. Unique on `(organizationId, email)`.
  - `Vehicle`: belongs to an organization; `make`, `model`, `year`, `vin`, nullable `licensePlate`. Unique on `(organizationId, vin)` and `(organizationId, licensePlate)`.
- Idempotent dev seed `prisma/seed.ts`: org `acme-logistics`, 2 users, 3 vehicles. Refuses to run in production.
- `/api/v1/health` reports `database: up | down` and returns 503 when the database is down.
- `DATABASE_URL` validated; `NODE_ENV=test` loads only `.env.test`.
- Unit tests with mocked Prisma; integration/e2e tests against the test database (`test/database.e2e-spec.ts`).

**Decisions**

- Multi-tenancy uses a shared schema with an `organizationId` column on every tenant-owned table. Uniqueness is scoped per tenant so one tenant cannot detect another tenant's data.
- Foreign keys are `onDelete: Restrict`.
- UUIDv7 primary keys, snake_case table/column names, `timestamptz(3)` timestamps.
- `PrismaService` is used directly in services. No repository layer.
- Tests can never touch the development database.

**Out of scope (still not built)**

- Authentication and authorization (no login, no JWT, no guards). Password hashes exist only so auth can be added later.
- REST endpoints for organizations, users or vehicles. The models exist only in the database and the seed.
- Roles and permissions.
- How the current tenant is resolved for a request. Every tenant query must filter by `organizationId`, but nothing supplies it from a request yet.

---

## Phase 3 — Authentication + tenant context

**Status:** Done (`0195815`)

**Goal:** users can log in, and every protected request knows which user and organization it belongs to.

**NestJS concepts:** guards, custom decorators, `@nestjs/jwt`, global guards with a `@Public()` opt-out, `ExecutionContext`, `Reflector`.

**Built**

- `AuthModule` in `src/auth/`:
  - `POST /api/v1/auth/login` (public, 200): `{ organizationSlug, email, password }` → `{ accessToken, tokenType: 'Bearer', expiresIn }`. Slug and email are trimmed and lowercased; the password is verified with Argon2id.
  - `GET /api/v1/auth/me`: the current user (7 fields, never `passwordHash`), queried by `id` **and** `organizationId`.
- `JwtAuthGuard` registered globally via `APP_GUARD`. Accepts only `Authorization: Bearer <token>` with HS256; payload `sub`/`org` must be non-empty strings. Any failure → bare 401.
- `@Public()` (`src/auth/public.decorator.ts`) on root and health; `@CurrentUser()` (`src/auth/current-user.decorator.ts`) returns `{ userId, organizationId }`.
- Env vars `JWT_SECRET` (required, ≥ 32 chars) and `JWT_EXPIRES_IN` (seconds, 60–86400, default 900).
- New dependency `@nestjs/jwt`; `@node-rs/argon2` moved to `dependencies`.
- Unit tests (auth service, guard, login DTO, env validation) and `test/auth.e2e-spec.ts`.

**Decisions**

- **Routes are protected by default.** Every new route requires a token unless it has `@Public()`. Every future feature's e2e tests should include a 401-without-token case and a cross-tenant case.
- **Tenant context comes from the token.** Services take `organizationId` from `@CurrentUser()`, never from the request body or URL.
- JWT payload is `{ sub: userId, org: organizationId }`, HS256 only, lifetime 900 s.
- No Passport: one custom guard is simpler for a single bearer strategy.
- All login failures (unknown org, unknown email, wrong password, email from another org, malformed stored hash) return the same 401 `Invalid credentials`. Unknown users are still checked against a dummy hash to reduce timing differences.
- No schema change and no migration.

**Out of scope (still not built)**

- Refresh tokens, logout and token revocation. A deleted user's token is still accepted by routes that don't re-read the user, until it expires.
- Rate limiting on login (phase 8).
- Sign-up, password reset, email verification.
- Roles (phase 5).

---

## Phase 4 — Vehicles API

**Status:** Done (`9e4a426`)

**Goal:** the first full CRUD resource, scoped to the caller's organization.

**NestJS concepts:** feature module structure, DTOs with class-validator and class-transformer, `ParseUUIDPipe`, custom validators (`ValidateBy`), mapping Prisma errors to HTTP exceptions, response DTOs.

**Built**

- `VehiclesModule` in `src/vehicles/`, all routes behind the global JWT guard:
  - `GET /api/v1/vehicles`: `{ data, meta: { page, limit, total } }`. `page` default 1; `limit` default 20, max 100. Filters `make`, `model` (case-insensitive exact match) and `year`. Newest first, ties broken by `id`.
  - `POST /api/v1/vehicles` (201), `GET /api/v1/vehicles/:id`, `PATCH /api/v1/vehicles/:id`, `DELETE /api/v1/vehicles/:id` (204).
- Validation: VIN 17 characters without I/O/Q, trimmed and uppercased; license plate optional, trimmed and uppercased, max 15; year 1900 to the current UTC year + 1, checked on each request; make/model trimmed, max 50, case kept.
- Responses have exactly 8 fields (`id, make, model, year, vin, licensePlate, createdAt, updatedAt`), with no `organizationId`.
- Unit tests (service, three DTOs) and `test/vehicles.e2e-spec.ts`, including cross-tenant read/update/delete attempts.

**Decisions**

- **Tenant scoping in the query itself.** `findFirst`, `update` and `delete` all use `where: { id, organizationId }`. Another organization's vehicle returns the same 404 as a missing one, and it returns 404 rather than 409 even when the update would collide.
- **Prisma errors are mapped locally** in `vehicles.service.ts` (`toHttpError`): P2025 → 404, P2002 → 409 naming VIN or license plate. With `@prisma/adapter-pg` the duplicate is identified by the index name in `meta.driverAdapterError.cause.constraint.index`, not `meta.target`. Other errors are rethrown. A shared mapper waits for a second resource or phase 8.
- **PATCH DTO written by hand**, not `PartialType`: `null` for a required column must be a 400, not a database error. `licensePlate: null` clears the plate; an omitted field is left unchanged.
- **Prisma `data` is built field by field**, never by spreading a DTO (with `useDefineForClassFields`, every declared DTO property exists as a key).
- `:id` must be a UUIDv7 (`ParseUUIDPipe({ version: '7' })`), otherwise 400.
- Hard delete. No migration: the existing unique indexes start with `organization_id`.

**Out of scope (still not built)**

- Driver assignment (phase 6), vehicle status or lifecycle, soft delete.
- Role checks (phase 5): any user in the organization can create, update or delete vehicles.
- Partial-match search, sorting parameters, cursor pagination.
- Collapsing repeated spaces in plates (`FLT 1001` and `FLT  1001` are different plates).
- P2003 (foreign-key error, e.g. the organization deleted while a token is still valid) is not mapped and returns 500.

---

## Phase 5 — Users + roles

**Status:** Done (`c80e806`)

**Goal:** organization admins manage their users, and permissions depend on role.

**NestJS concepts:** role-based guards with metadata (`@Roles()` + `Reflector`), enum columns in Prisma.

**Built**

- `Role` enum (`user_role`: ADMIN, MANAGER, DRIVER) and `users.role` column, default `DRIVER` (migration `add_user_role`). Seed: Alex ADMIN, Sam DRIVER, new Morgan MANAGER.
- `UsersModule` in `src/users/`: 5 admin-only routes (`GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/:id`), 7-key responses, paginated list with `role` filter.
- `PATCH /api/v1/auth/me/password` (any role, 204). `role` added to `/auth/me`.
- `@Roles()` decorator and a global `RolesGuard`. Vehicle writes (create, update, delete) require ADMIN or MANAGER; reads are open to all roles.

**Decisions**

- Role is not in the JWT. `JwtAuthGuard` re-reads `{ id, organizationId, role }` on every request, so role changes and deletions apply immediately (this fixes the phase 3 deleted-user item). `sub` and `org` must be UUIDs, otherwise 401 before any query.
- `RolesGuard` is a second `APP_GUARD` registered after `JwtAuthGuard`. A route without `@Roles()` is open to any authenticated user. Guards run before pipes, so a forbidden request gets 403 even with an invalid body.
- DB default is DRIVER (least privilege); role is required when creating a user.
- An admin cannot delete themselves or change their own role (409).
- Password 12 to 128 characters, not trimmed, must differ from the current one; a wrong current password is 400.
- Duplicate email in an organization is 409; cross-tenant access is 404 (also when a PATCH email would collide).

**Out of scope / deferred**

- Admin password reset; token revocation after a password or role change.
- Transactional last-admin protection against concurrent mutual demotion.
- Rate limiting on password change (phase 8).
- Inviting users by email; custom or per-resource permissions.
- ~~P2003 on user delete~~ resolved in phase 6: `drivers.user_id` is `ON DELETE SET NULL`, so deleting a user needs no mapping.

---

## Phase 6 — Drivers + vehicle assignments

**Status:** Done (`961d586`)

**Goal:** record which driver uses which vehicle and when.

**NestJS concepts:** Prisma relations and interactive transactions, business-rule validation in services, partial unique indexes.

**Built**

- Migration `add_drivers_and_assignments`: `drivers` and `vehicle_assignments` tables. Generator now uses the `partialIndexes` preview feature.
- `DriversModule` (`src/drivers/`): `GET/POST /api/v1/drivers`, `GET/PATCH/DELETE /api/v1/drivers/:id`. 8-key responses; `licenseExpiresOn` is `YYYY-MM-DD`.
- `AssignmentsModule` (`src/assignments/`): `GET/POST /api/v1/assignments`, `GET /api/v1/assignments/:id`, `POST /api/v1/assignments/:id/end`. List filters `vehicleId`, `driverId`, `active`. History of a vehicle is `GET /assignments?vehicleId=...`.
- `src/database/prisma-errors.ts`: `uniqueConstraintHints` moved out of the vehicles service.
- Seed: two drivers (Sam linked to the `sam@acme-logistics.test` user, Jordan with an expired license) and one active assignment (Sam to the Ford Transit).

**Decisions**

1. `Driver` is its own tenant-owned model, optionally linked to one `User` (`userId` unique, any role). `drivers.user_id` is `ON DELETE SET NULL`, a deliberate exception to Restrict: the driver and the history outlive the login account. This resolves the phase 5 deferred P2003 on user delete.
2. Assignment times are set by the server (`startedAt` on create, `endedAt` on end). No backdating or scheduling.
3. At most one active assignment per vehicle and per driver is enforced in the database by two partial unique indexes (`WHERE ended_at IS NULL`) declared in `schema.prisma`, and checked in the service.
4. Create runs in one interactive transaction: vehicle exists (404), driver exists (404), license not expired (422), vehicle free (409), driver free (409). A lost race hits the partial index; its P2002 is mapped by index name to the same 409.
5. Ending is one conditional `updateMany` (`endedAt: null`); a zero count is 404 or 409 depending on whether the row exists.
6. History is kept: assignment foreign keys to vehicles and drivers are Restrict. Deleting a vehicle or driver with any assignment returns 409. This changes `DELETE /vehicles/:id` for vehicles that were ever assigned.
7. A license is valid through its expiry date (UTC, inclusive). Expired drivers can be created and updated but not assigned. Active assignments are not auto-ended.
8. All `/drivers` and `/assignments` routes are ADMIN or MANAGER; DRIVER gets 403.
9. Prisma errors are still mapped per service; only the unique-hint parser is shared. No global filter (phase 8).

- Never use `findUnique`/`update`/`delete` by `vehicleId` or `driverId` on assignments: the partial uniques only cover active rows (`ended_at IS NULL`), so with history such a lookup can match several rows. Always use `findFirst`/`updateMany` with `organizationId` (and `endedAt: null` where relevant).

**Out of scope / deferred**

- Client-supplied, backdated or scheduled start/end times; reassigning in one call.
- Driver self-service and any read access for the DRIVER role.
- Auto-ending assignments on license expiry; expiry reminders (phase 7 scheduler, later notifications).
- Driver list filters, search, sorting; license class, issuing country.
- Soft delete or archiving of vehicles and drivers; editing or deleting assignment history.
- Trips, GPS, telemetry, utilization metrics.
- Global Prisma error filter (phase 8). A P2003 race on assignment create (vehicle or driver deleted between check and insert) is unmapped and returns 500.

---

## Phase 7 — Maintenance + fuel records

**Status:** Done (`f12eeed`)

**Goal:** track running costs and upcoming service per vehicle.

**NestJS concepts:** scheduled jobs (`@nestjs/schedule`), interactive transactions with a row lock, Prisma `Decimal`, aggregation queries.

**Built**

- Migration `add_maintenance_and_fuel`: enums `vehicle_service_status` and `maintenance_type`, tables `maintenance_records` and `fuel_logs`, vehicle columns `next_service_due_on` and `service_status`.
- `MaintenanceModule` (`src/maintenance/`): five CRUD routes under `/api/v1/vehicles/:vehicleId/maintenance-records`, and `ServiceStatusJob`.
- `FuelLogsModule` (`src/fuel-logs/`): five CRUD routes under `/api/v1/vehicles/:vehicleId/fuel-logs`.
- `CostSummaryModule` (`src/cost-summary/`): `GET /api/v1/vehicles/:vehicleId/cost-summary`.
- `src/common/`: `date-only.ts` (date helpers and the `IsNotAfterTomorrowUtc` validator) and `decimal-string.ts` (`IsDecimalString`).
- Vehicle responses grow from 8 to 10 keys (`nextServiceDueOn`, `serviceStatus`); `GET /vehicles` gains a `serviceStatus` filter.
- Seed: maintenance records for two vehicles, three fuel logs for the Ford Transit.

**Decisions**

1. Money and volume use Prisma `Decimal` (`cost` and `totalCost` `Decimal(12,2)`, `liters` `Decimal(8,3)`), never floats. Input is a JSON string only; output is a fixed-scale string. One currency per organization.
2. Dates are date-only. `performedOn` and `fueledOn` must be between 1900-01-01 and tomorrow (UTC).
3. The odometer is informational: stored on records, not on `Vehicle`, with no cross-record checks.
4. Service due is date-based. `Vehicle.nextServiceDueOn` is the due date of the latest record that has one; `serviceStatus` is UNKNOWN, OVERDUE (before today), DUE_SOON (today to today + 14 days) or OK. The 14 days is the constant `SERVICE_DUE_SOON_DAYS`, not an env var.
5. Maintenance create, update and delete recompute the vehicle in the same interactive transaction, after locking the vehicle row with `SELECT ... FOR UPDATE` (a `$queryRaw` tagged template, never `$queryRawUnsafe`). The lock serializes concurrent writes per vehicle. Vehicle `updatedAt` bumps on maintenance writes. Fuel logs do not affect service status.
6. A daily job (`@Cron('0 2 * * *')`, UTC) advances `serviceStatus` with four `updateMany` calls in one transaction and logs the counts. It is the **only cross-tenant query in the codebase**: a system job that writes only the derived `serviceStatus` column (and `updatedAt`) from each row's own `nextServiceDueOn`. It is idempotent and does not run on startup.
7. `@nestjs/event-emitter` is not adopted: the only consumer is in the same module and must run in the same transaction. Events arrive with notifications.
8. All new routes are ADMIN or MANAGER, reads included. Fuel logs carry no driver; driver self-service is deferred.
9. All new foreign keys are `Restrict` and records are hard-deleted. A vehicle with any assignment, maintenance record or fuel log cannot be deleted (409, message changed to `Vehicle has related records and cannot be deleted`).
10. New vehicle fields are not writable through the vehicle DTOs.
11. The cost summary uses `groupBy` by date with `_sum` (one query per table), bucketed into months in JS with `Prisma.Decimal`. No raw SQL. Range default is 12 months, maximum 24.
12. Shared helpers live in `src/common/`; `parseDateOnly` and `toDateOnly` moved there from the drivers module.

**Out of scope / deferred**

- Notifications and reminders (event emitter arrives with them).
- Auto-ending assignments on license expiry (phase 6 parked it for the phase 7 scheduler; still not built).
- DRIVER self-service fuel entry and a driver on fuel logs.
- Odometer on `Vehicle`, odometer monotonicity, kilometer-based service intervals.
- Recurring maintenance schedules or service plans; a configurable due-soon window.
- Multi-currency, fuel type, price per liter, station or vendor entities.
- File uploads (receipts, invoices).
- Fleet-wide cost reports, CSV export, dashboards.
- Soft delete or archiving of vehicles.
- Running the job on startup. Resolved later: distributed lock (phase 9, advisory lock), global error filter (phase 8).

---

## Phase 8 — API docs, logging + error format

**Status:** Done (`2395d09`)

**Goal:** make the API easy to use and to debug.

**NestJS concepts:** `@nestjs/swagger` (CLI plugin), exception filters, middleware, `@nestjs/throttler` guards.

**Built**

- Swagger UI `/api/docs`, JSON `/api/docs-json` (not mounted in production). `@ApiTags` on all controllers, `@ApiBearerAuth` on protected ones.
- `AllExceptionsFilter` and one error shape (`src/common/http/`), with `details` for validation errors.
- `requestContextMiddleware`: `X-Request-Id` and one `HTTP` log line per request. `createAppLogger` (`ConsoleLogger`, JSON in production).
- Rate limiting on login and password change (`src/auth/throttling.ts`).
- `mapPrismaError` global safety net; health 503 returns the health body via `@Res({ passthrough: true })`.
- Env vars `LOG_LEVEL`, `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT`, `THROTTLE_IP_LIMIT`.

**Decisions**

1. Only two dependencies added: `@nestjs/swagger` and `@nestjs/throttler`. No pino; the built-in `ConsoleLogger` is enough.
2. Swagger schemas come from the Nest CLI plugin (`introspectComments`), not hand-written `@ApiProperty`; only `@ApiPropertyOptional` on list-query `page`/`limit`. ts-jest does not run the plugin.
3. The error shape is `statusCode`, `error`, `message` (always one string), `requestId`, `timestamp`, `path`, optional `details`. A 500 never reveals the original message.
4. The filter is registered with `useGlobalFilters`, not `APP_FILTER`. Per-service Prisma mappers stay; the filter maps leftovers (P2002/P2003 to 409, P2025 to 404).
5. Request ID is middleware (registered first), so guard 401/403/429 and unknown-route 404s also get one.
6. Throttling is not global: `ThrottlerGuard` only on login and password change, with two throttlers (account key and IP). In-memory storage.
7. Request logs never include headers, bodies or query strings.
8. Health 503 intentionally keeps the health body.
9. Nest mounts its not-found handler only under the global prefix, so `configureApp` adds a middleware (right after the request-context one) that returns the standard 404 for any path outside `/api`. Everything is served under `/api`, including the docs.
10. Jest needs `test/utils/preload-esm.ts` (e2e `setupFiles`) because the CommonJS throttler `require()`s the ESM Nest packages.

**Out of scope / deferred**

- Redis-backed throttling (still deferred after phase 9); distributed multi-IP attacks are not limited. Trust proxy: resolved in phase 9 (`TRUST_PROXY`).
- Request ID in service logs (needs AsyncLocalStorage); aborted requests are not logged.
- Unknown-route 404 message echoes the URL including the query string (Nest default).
- External monitoring or tracing services.
- Resolved here: phase 3 and 5 rate-limit items, phase 4 and 6 P2003 items (now 409 via the filter), phase 7 global error filter.

---

## Phase 9 — Docker, CI + deployment

**Status:** Done (commit pending)

**Goal:** the API can be built, tested and deployed automatically.

**Built**

- Multi-stage `Dockerfile` (`deps`, `build`, `prod-deps`, `migrate`, `runtime`), `.dockerignore`, `docker-compose.yml` (PostgreSQL 18 with `fleetops_dev` and `fleetops_test`, one-off `migrate`, `api`), `.nvmrc`.
- `.github/workflows/ci.yml`: `test` job (lint, unit, migrate, e2e, build against a PostgreSQL service) and `docker` smoke job.
- `GET /health/live` and `GET /health/ready`; `TRUST_PROXY` env var; advisory lock in `ServiceStatusJob`.

**Decisions**

1. `/health` is unchanged. `/health/live` always returns 200 and touches no dependency. `/health/ready` returns 200 only with the database up and migrations applied, otherwise 503 with the same body (not the error shape).
2. "Migrations applied" is a subset check: every migration directory shipped in the build must be finished and not rolled back in `_prisma_migrations`; unknown newer rows are ignored. The directory comes from the `MIGRATIONS_DIR` token (`process.cwd()/prisma/migrations`). `unknown` (database down, directory missing or empty, query error) means not ready. Pending names are only logged.
3. Migrations are a separate one-off release step, never run by the container entrypoint (no N-fold runs, no crash loops, no Prisma CLI or DDL rights in the runtime image).
4. Runtime image: production dependencies only, non-root, `node` as PID 1 for SIGTERM, files root-owned, health check on readiness.
5. `.dockerignore` excludes `*.tsbuildinfo` (a stale incremental build info can make tsc emit nothing), `.env*` and `src/generated`.
6. Compose ignores `.env`, sets variables per service with defaults, and uses a clearly dev-only `JWT_SECRET` default.
7. CI uses real env vars (`DATABASE_URL`) over `.env.test` copied from the example. Node version comes from `.nvmrc`.
8. `TRUST_PROXY` is a hop count (0-10, default 0), applied in `configureApp`; booleans are unsupported to prevent `req.ip` spoofing.
9. The daily job runs in an interactive transaction (timeout 60 s) guarded by `pg_try_advisory_xact_lock`; it returns `null` when skipped.
10. Throttler storage stays in memory: limits are per instance.
11. No schema change, migration or new dependency.

**Out of scope / deferred**

- Redis throttling, Kubernetes, multi-region, image registry publishing, an actual deploy target.
- Excluding probes from request logs, request ID in service logs, running the job on startup.
- The GitHub workflow is proven only on its first run.

---

## Template for future phases

```md
## Phase N — <name>

**Status:** Planned | In progress | Done (`<commit>`)

**Goal:** <one sentence>

**NestJS concepts:** <what this phase teaches>

**Built** / **Scope**

- ...

**Decisions**

- ...

**Out of scope**

- ...
```
