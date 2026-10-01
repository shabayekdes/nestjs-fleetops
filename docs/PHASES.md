# FleetOps API — Phase Roadmap

FleetOps is built in phases, partly as a way to learn NestJS. This file records what each phase delivered, the decisions it made, and what it deliberately left out. Use it as context before planning a new phase.

Rules for working with phases:

- Build only the current phase. Do not implement anything listed under a later phase or under "Out of scope" without the user's approval.
- When a phase is finished, update its entry here: set the status, list what was built, and record its decisions and deferred items.
- Conventions live in `CLAUDE.md`. This file covers scope and history only.
- Planned phases are a direction, not a spec. Before starting one, confirm its scope with the user, then ask `cto-esmail` for a plan. The order and content of planned phases may change.

| Phase | Name                             | Status  | Commit(s) |
| ----- | -------------------------------- | ------- | --------- |
| 1     | Application foundation           | Done    | `4b1d372` |
| 2     | PostgreSQL + Prisma              | Done    | `5623cff` |
| 3     | Authentication + tenant context  | Done    | `0195815` |
| 4     | Vehicles API                     | Planned | —         |
| 5     | Users + roles                    | Planned | —         |
| 6     | Drivers + vehicle assignments    | Planned | —         |
| 7     | Maintenance + fuel records       | Planned | —         |
| 8     | API docs, logging + error format | Planned | —         |
| 9     | Docker, CI + deployment          | Planned | —         |

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

**Status:** Planned

**Goal:** the first full CRUD resource, scoped to the caller's organization.

**NestJS concepts:** feature module structure, DTOs with class-validator, `ParseUUIDPipe`, mapping Prisma errors to HTTP exceptions, response DTOs.

**Scope**

- `GET/POST /api/v1/vehicles`, `GET/PATCH/DELETE /api/v1/vehicles/:id`.
- Every query filters by the caller's `organizationId`. A vehicle in another organization returns 404, not 403.
- Pagination (`page`, `limit`) and simple filters (e.g. `make`, `year`) on the list endpoint.
- Duplicate VIN or license plate within the organization returns 409.

**Out of scope**

- Assigning drivers to vehicles (phase 6).
- Vehicle status or lifecycle beyond create/update/delete.

**Acceptance criteria**

- e2e tests prove a user cannot read or change another organization's vehicles.

---

## Phase 5 — Users + roles

**Status:** Planned

**Goal:** organization admins manage their users, and permissions depend on role.

**NestJS concepts:** role-based guards with metadata (`@Roles()` + `Reflector`), enum columns in Prisma.

**Scope**

- `role` on `User` (e.g. `ADMIN`, `MANAGER`, `DRIVER`) via a migration; seed updated.
- `GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/:id`, admin only.
- `PATCH /api/v1/auth/me/password` for users to change their own password.
- Apply role checks to the vehicles endpoints (e.g. drivers can read but not write).

**Out of scope**

- Custom or per-resource permissions.
- Inviting users by email.

---

## Phase 6 — Drivers + vehicle assignments

**Status:** Planned

**Goal:** record which driver uses which vehicle and when.

**NestJS concepts:** Prisma relations and transactions, business-rule validation in services.

**Scope**

- `Driver` model (tenant-owned, optionally linked to a `User`), with license number and expiry.
- `VehicleAssignment` model with start/end times.
- Endpoints to assign and unassign a driver and to see the current and past assignments of a vehicle or driver.
- Rules: a vehicle has at most one active driver; a driver with an expired license cannot be assigned.

**Out of scope**

- Trip tracking, GPS or telemetry.

---

## Phase 7 — Maintenance + fuel records

**Status:** Planned

**Goal:** track running costs and upcoming service per vehicle.

**NestJS concepts:** scheduled jobs (`@nestjs/schedule`), events (`@nestjs/event-emitter`), aggregation queries.

**Scope**

- `MaintenanceRecord` and `FuelLog` models with CRUD endpoints nested under vehicles.
- A per-vehicle cost summary endpoint (totals by month).
- A daily scheduled job that flags vehicles with service due soon.

**Out of scope**

- Sending email or push notifications.
- File uploads (receipts, invoices).

---

## Phase 8 — API docs, logging + error format

**Status:** Planned

**Goal:** make the API easy to use and to debug.

**NestJS concepts:** `@nestjs/swagger`, interceptors, exception filters, middleware.

**Scope**

- OpenAPI/Swagger docs generated from the DTOs, served in development.
- One JSON error shape for every error response.
- Structured request logging with a request ID.
- Rate limiting on the login endpoint (`@nestjs/throttler`).

**Out of scope**

- External monitoring or tracing services.

---

## Phase 9 — Docker, CI + deployment

**Status:** Planned

**Goal:** the API can be built, tested and deployed automatically.

**Scope**

- Multi-stage `Dockerfile` and a `docker-compose.yml` with PostgreSQL for local development.
- CI pipeline (e.g. GitHub Actions) that runs lint, unit tests, e2e tests against a PostgreSQL service, and the build.
- `prisma migrate deploy` as part of the deployment.
- A production readiness check on top of `/api/v1/health`.

**Out of scope**

- Kubernetes or multi-region infrastructure.

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
