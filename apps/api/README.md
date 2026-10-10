# FleetOps API

This is the NestJS API in the FleetOps monorepo (`apps/api/`). Unless stated otherwise, run every command in this file from `apps/api/`; `docker compose` commands run from the repository root. See the [root README](../../README.md) and [docs](../../docs/).

Backend API for **FleetOps**, a B2B fleet management platform, built with NestJS and TypeScript.

The project is developed incrementally. Current state: application foundation (bootstrap, configuration, versioned routing, global validation), a PostgreSQL database layer with Prisma and a database-aware health check, JWT authentication with tenant context (login by organization slug, global auth guard), and a tenant-scoped Vehicles CRUD API.

## Technology Stack

- [NestJS](https://nestjs.com/) 12 (Express adapter)
- TypeScript (strict mode, native ES modules)
- PostgreSQL
- [Prisma ORM](https://www.prisma.io/) 7 (`prisma-client` generator + `@prisma/adapter-pg` driver adapter)
- `@nestjs/config` for environment configuration
- `class-validator` / `class-transformer` for validation
- Jest + Supertest for testing
- ESLint (typescript-eslint) + Prettier

## Requirements

- Node.js >= 22 (developed on Node 24)
- npm >= 10
- PostgreSQL 14+ (developed against PostgreSQL 18), local or hosted (e.g. Neon)
- Docker with Compose v2 (optional): local PostgreSQL and the container image

## Installation

```bash
cd apps/api
npm install                    # also runs `prisma generate` (postinstall)
cp .env.example .env
cp .env.test.example .env.test # only needed for e2e/integration tests
```

## Environment Configuration

Configuration is read from environment variables. Values are validated at startup and the application refuses to start if they are invalid. Real environment variables always override values from the `.env` files.

| Variable               | Description                                                                          | Default       |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `NODE_ENV`             | `development`, `production`, or `test`                                               | `development` |
| `PORT`                 | HTTP port the API listens on (1–65535)                                               | `3000`        |
| `DATABASE_URL`         | PostgreSQL connection string (**required**)                                          | —             |
| `JWT_SECRET`           | HS256 signing secret, at least 32 chars (**required**). `openssl rand -base64 48`    | —             |
| `JWT_EXPIRES_IN`       | Access token lifetime in seconds (60–86400)                                          | `900`         |
| `LOG_LEVEL`            | `fatal`, `error`, `warn`, `log`, `debug` or `verbose`                                | `log`         |
| `THROTTLE_TTL_SECONDS` | Rate-limit window in seconds (1–3600)                                                | `60`          |
| `THROTTLE_LIMIT`       | Attempts per window: per account+IP on login, per user on password change (1–10000)  | `5`           |
| `THROTTLE_IP_LIMIT`    | Attempts per window per IP on both routes (1–10000)                                  | `30`          |
| `TRUST_PROXY`          | Trusted reverse-proxy hops in front of the API (0–10). `0` ignores `X-Forwarded-For` | `0`           |

Existing `.env` and `.env.test` files created before authentication was added must be updated with a `JWT_SECRET`, otherwise the app will not start.

Which file is loaded:

- `NODE_ENV=test` (set automatically by Jest) → **only** `.env.test`
- otherwise → `.env`

Tests therefore can never fall back to the development database. `.env` and `.env.test` are git-ignored; commit changes to the `*.example` files only.

## PostgreSQL Setup

### Option A — local PostgreSQL

Create a role and databases once (the role needs `CREATEDB` so `prisma migrate dev` can create its temporary shadow database):

```bash
sudo -u postgres psql -c "CREATE ROLE fleetops LOGIN CREATEDB PASSWORD 'fleetops';"
sudo -u postgres createdb -O fleetops fleetops_dev
sudo -u postgres createdb -O fleetops fleetops_test
```

```dotenv
# .env
DATABASE_URL="postgresql://fleetops:fleetops@localhost:5432/fleetops_dev?schema=public"
# .env.test
DATABASE_URL="postgresql://fleetops:fleetops@localhost:5432/fleetops_test?schema=public"
```

### Option B — Neon (hosted)

Use the **direct** connection string (host without `-pooler`). Prisma Migrate needs a direct connection, and a long-running NestJS process manages its own connection pool. Use a separate database (or Neon branch) for tests.

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=verify-full"
```

### Option C — Docker Compose

```bash
docker compose up -d postgres   # from the repository root
```

This starts PostgreSQL 18 and creates `fleetops_dev` and `fleetops_test` (role `fleetops`, password `fleetops`, a superuser so `prisma migrate dev` can create its shadow database).

```dotenv
# .env
DATABASE_URL="postgresql://fleetops:fleetops@localhost:5432/fleetops_dev?schema=public"
# .env.test
DATABASE_URL="postgresql://fleetops:fleetops@localhost:5432/fleetops_test?schema=public"
```

The init script runs only when the data volume is empty. With an existing volume, create the test database once: `docker compose exec postgres createdb -U fleetops fleetops_test`.

## Database (Prisma)

| File                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `prisma/schema.prisma`  | Data model (source of truth)                                      |
| `prisma/migrations/`    | Generated SQL migrations — committed, never edited after applied  |
| `prisma/seed.ts`        | Idempotent development seed                                       |
| `prisma/e2e-cleanup.ts` | Test-only cleanup of data left by the web Playwright tests        |
| `prisma.config.ts`      | Prisma CLI config (schema/migrations paths, datasource URL, seed) |
| `src/generated/prisma/` | Generated client — git-ignored, rebuilt by `prisma generate`      |

### Commands

```bash
npm run prisma:validate      # npx prisma validate      — validate the schema
npm run prisma:generate      # npx prisma generate      — regenerate the typed client after schema changes

npm run db:migrate           # npx prisma migrate dev   — create + apply a migration in development
npm run db:migrate -- --name add_drivers                # name the new migration
npm run db:migrate:deploy    # npx prisma migrate deploy — apply pending migrations (CI / production)
npx prisma migrate status    # show applied / pending migrations

npm run db:seed              # npx prisma db seed       — load development data (safe to re-run)
npm run db:reset             # drop all data, re-apply migrations, re-seed (asks for confirmation)
npm run db:studio            # npx prisma studio        — browse data in the browser

npm run db:test:migrate      # apply migrations to the database in .env.test
npm run db:test:e2e-cleanup  # TEST ONLY: delete E2E rows left by the web Playwright tests
```

### E2E cleanup (test-only)

`npm run db:test:e2e-cleanup` runs `prisma/e2e-cleanup.ts` with `NODE_ENV=test`, so it only ever reads `.env.test`. It exists because the API cannot delete assignments and all FKs are `Restrict`, so E2E drivers and vehicles that were ever assigned cannot be removed through the API. It is not an endpoint and never runs automatically in the API.

It refuses to run (non-zero exit) unless `NODE_ENV=test`, `DATABASE_URL` is set and the database name contains `test`. It only touches the `acme-logistics` organization (exit 0 with a message if it is missing) and deletes, in one transaction, and logs the count per table:

1. `vehicle_assignments` whose driver `licenseNumber` starts with `E2E-` or vehicle `vin` starts with `E2E`
2. `maintenance_records` and `fuel_logs` of vehicles whose `vin` starts with `E2E`
3. `drivers` whose `licenseNumber` starts with `E2E-`
4. `vehicles` whose `vin` starts with `E2E`
5. `users` whose email starts with `e2e-` (drivers still linked to them are unlinked first)

Seed data (`DL-*` licenses, VINs starting `1FT`/`WD3`/`YV2`, `*@acme-logistics.test`) never matches these prefixes. The web Playwright `globalTeardown` runs it with `npm --prefix ../api run db:test:e2e-cleanup`.

`prisma migrate dev` is for development only — it may prompt to reset the database on drift. Deployed environments use `prisma migrate deploy`.

### Development Seed Data

> **DEVELOPMENT ONLY.** All data is fictional. The password is public. The seed refuses to run when `NODE_ENV=production`.

| Organization   | Slug             |
| -------------- | ---------------- |
| Acme Logistics | `acme-logistics` |

| User           | Email                        | Role    | Password            |
| -------------- | ---------------------------- | ------- | ------------------- |
| Alex Fleetwood | `alex@acme-logistics.test`   | ADMIN   | `FleetOps-dev-123!` |
| Morgan Manager | `morgan@acme-logistics.test` | MANAGER | `FleetOps-dev-123!` |
| Sam Driver     | `sam@acme-logistics.test`    | DRIVER  | `FleetOps-dev-123!` |

Plus three vehicles (Ford Transit, Mercedes-Benz Sprinter, Volvo FH16 — the latter without a license plate).

Vehicle master data (global, not tied to the organization): 5 makes and 14 models (Toyota, Ford, BMW, Mercedes-Benz, Volvo), upserted on `slug` and `makeId + slug`, and 6 vehicle types (Car, Van, Pickup, Truck, Bus, Motorcycle), upserted on `slug`.

| Driver         | License   | Expires              | Linked user               |
| -------------- | --------- | -------------------- | ------------------------- |
| Sam Driver     | `DL-1001` | 1 January next year  | `sam@acme-logistics.test` |
| Jordan Expired | `DL-1002` | 2024-01-31 (expired) | none                      |

Sam is actively assigned to the Ford Transit (created only if neither the driver nor the Transit already has an active assignment).

Maintenance and fuel data (created only if the vehicle has none of that kind yet): the Ford Transit has an oil change 120 days ago (`89.90`, next service in 10 days, so `DUE_SOON`) and three fuel logs in the last three months; the Mercedes-Benz Sprinter has an inspection 30 days ago (`150.00`, next service in 180 days, so `OK`); the Volvo FH16 has none (`UNKNOWN`).

Passwords are stored as Argon2id hashes. Records are upserted on their natural keys (`slug`, `organizationId + email`, `organizationId + vin`), so re-running the seed never duplicates data.

## Running the Application

PostgreSQL must be reachable at startup: the app runs a `SELECT 1` during bootstrap and exits if the database is unavailable.

```bash
npm run db:migrate:deploy   # first run: apply migrations
npm run db:seed             # optional: development data

npm run start:dev           # development (watch mode)
npm run start               # development (single run)

npm run build               # production
npm run start:prod
```

## Running Tests

```bash
npm run test       # unit tests — no database required (PrismaService is mocked)
npm run test:e2e   # e2e + database integration tests — requires .env.test
npm run test:cov   # unit test coverage
```

The e2e suite runs against the real database in `.env.test`. Prepare it once (and after every new migration):

```bash
npm run db:test:migrate
```

Integration tests create uniquely-named organizations and delete only those rows afterwards; they never truncate tables. Jest runs in native ESM mode (`--experimental-vm-modules`) because NestJS 12 and the Prisma 7 client are ES modules.

## Running Lint

```bash
npm run lint        # check
npm run lint:fix    # auto-fix
npm run typecheck   # tsc --noEmit over src, test and prisma
npm run format      # Prettier
```

## API Endpoints

All routes are served under the `/api` prefix with URI versioning (default version `v1`).

| Method | Path                                                  | Description                                                                      |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/v1`                                             | Confirms the API is running                                                      |
| GET    | `/api/v1/health`                                      | Application + database health (200 / 503)                                        |
| GET    | `/api/v1/health/live`                                 | Liveness: always 200, touches no dependency                                      |
| GET    | `/api/v1/health/ready`                                | Readiness: database up and migrations applied (200 / 503)                        |
| POST   | `/api/v1/auth/login`                                  | Public. Exchange credentials for an access token                                 |
| GET    | `/api/v1/auth/me`                                     | Bearer token. Current user profile (with role and organization)                  |
| PATCH  | `/api/v1/auth/me/password`                            | Bearer token, any role. Change own password (204)                                |
| GET    | `/api/v1/users`                                       | Bearer token, ADMIN. List users (paginated, role filter)                         |
| POST   | `/api/v1/users`                                       | Bearer token, ADMIN. Create a user                                               |
| GET    | `/api/v1/users/:id`                                   | Bearer token, ADMIN. Get a user                                                  |
| PATCH  | `/api/v1/users/:id`                                   | Bearer token, ADMIN. Partially update a user                                     |
| DELETE | `/api/v1/users/:id`                                   | Bearer token, ADMIN. Delete a user (204)                                         |
| GET    | `/api/v1/vehicles`                                    | Bearer token. List vehicles (paginated, filters)                                 |
| POST   | `/api/v1/vehicles`                                    | Bearer token, ADMIN or MANAGER. Create a vehicle                                 |
| GET    | `/api/v1/vehicles/:id`                                | Bearer token. Get a vehicle                                                      |
| PATCH  | `/api/v1/vehicles/:id`                                | Bearer token, ADMIN or MANAGER. Partially update a vehicle                       |
| DELETE | `/api/v1/vehicles/:id`                                | Bearer token, ADMIN or MANAGER. Delete a vehicle (204)                           |
| GET    | `/api/v1/drivers`                                     | Bearer token, ADMIN or MANAGER. List drivers (paginated, `licenseStatus` filter) |
| POST   | `/api/v1/drivers`                                     | Bearer token, ADMIN or MANAGER. Create a driver                                  |
| GET    | `/api/v1/drivers/:id`                                 | Bearer token, ADMIN or MANAGER. Get a driver                                     |
| PATCH  | `/api/v1/drivers/:id`                                 | Bearer token, ADMIN or MANAGER. Partially update a driver                        |
| DELETE | `/api/v1/drivers/:id`                                 | Bearer token, ADMIN or MANAGER. Delete a driver (204)                            |
| GET    | `/api/v1/assignments`                                 | Bearer token, ADMIN or MANAGER. List assignments (filters)                       |
| POST   | `/api/v1/assignments`                                 | Bearer token, ADMIN or MANAGER. Assign a driver to a vehicle                     |
| GET    | `/api/v1/assignments/:id`                             | Bearer token, ADMIN or MANAGER. Get an assignment                                |
| POST   | `/api/v1/assignments/:id/end`                         | Bearer token, ADMIN or MANAGER. End an assignment (200)                          |
| GET    | `/api/v1/vehicles/:vehicleId/maintenance-records`     | Bearer token, ADMIN or MANAGER. List maintenance records (paginated, filters)    |
| POST   | `/api/v1/vehicles/:vehicleId/maintenance-records`     | Bearer token, ADMIN or MANAGER. Create a maintenance record                      |
| GET    | `/api/v1/vehicles/:vehicleId/maintenance-records/:id` | Bearer token, ADMIN or MANAGER. Get a maintenance record                         |
| PATCH  | `/api/v1/vehicles/:vehicleId/maintenance-records/:id` | Bearer token, ADMIN or MANAGER. Partially update a maintenance record            |
| DELETE | `/api/v1/vehicles/:vehicleId/maintenance-records/:id` | Bearer token, ADMIN or MANAGER. Delete a maintenance record (204)                |
| GET    | `/api/v1/vehicles/:vehicleId/fuel-logs`               | Bearer token, ADMIN or MANAGER. List fuel logs (paginated, date range)           |
| POST   | `/api/v1/vehicles/:vehicleId/fuel-logs`               | Bearer token, ADMIN or MANAGER. Create a fuel log                                |
| GET    | `/api/v1/vehicles/:vehicleId/fuel-logs/:id`           | Bearer token, ADMIN or MANAGER. Get a fuel log                                   |
| PATCH  | `/api/v1/vehicles/:vehicleId/fuel-logs/:id`           | Bearer token, ADMIN or MANAGER. Partially update a fuel log                      |
| DELETE | `/api/v1/vehicles/:vehicleId/fuel-logs/:id`           | Bearer token, ADMIN or MANAGER. Delete a fuel log (204)                          |
| GET    | `/api/v1/vehicles/:vehicleId/cost-summary`            | Bearer token, ADMIN or MANAGER. Monthly maintenance and fuel costs               |
| GET    | `/api/v1/cost-summary`                                | Bearer token, ADMIN or MANAGER. Fleet-wide monthly maintenance and fuel costs    |
| GET    | `/api/v1/dashboard/fleet`                             | Bearer token, ADMIN or MANAGER. Fleet counts: vehicles, drivers, assignments     |
| GET    | `/api/v1/dashboard/me`                                | Bearer token, any role. Own driver profile and active assignment                 |
| GET    | `/api/v1/master-data/vehicle-makes`                   | Bearer token, any role. Global vehicle makes catalog (paginated)                 |
| GET    | `/api/v1/master-data/vehicle-makes/:slug`             | Bearer token, any role. One make by slug, including retired ones                 |
| GET    | `/api/v1/master-data/vehicle-makes/:makeId/models`    | Bearer token, any role. Models of one make (paginated)                           |
| GET    | `/api/v1/master-data/vehicle-types`                   | Bearer token, any role. Global vehicle types catalog (paginated)                 |
| GET    | `/api/v1/master-data/vehicle-types/:slug`             | Bearer token, any role. One vehicle type by slug, including retired ones         |

Every endpoint except `/api/v1` and `/api/v1/health*` requires an `Authorization: Bearer <token>` header.

```bash
curl http://localhost:3000/api/v1/health
```

Healthy (`200 OK`):

```json
{
  "status": "ok",
  "service": "fleetops-api",
  "timestamp": "2026-10-01T14:43:48.074Z",
  "database": "up"
}
```

Database unreachable (`503 Service Unavailable`):

```json
{
  "status": "error",
  "service": "fleetops-api",
  "timestamp": "2026-10-01T14:43:48.074Z",
  "database": "down"
}
```

### Authentication

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"organizationSlug":"acme-logistics","email":"alex@acme-logistics.test","password":"FleetOps-dev-123!"}'
# {"accessToken":"<token>","tokenType":"Bearer","expiresIn":900}

curl http://localhost:3000/api/v1/auth/me -H 'Authorization: Bearer <token>'
# {"id":"<uuid>","organizationId":"<uuid>","organization":{"id":"<uuid>","name":"Acme Logistics","slug":"acme-logistics"},"firstName":"Alex","lastName":"Doe","email":"alex@acme-logistics.test","role":"ADMIN","createdAt":"...","updatedAt":"..."}
```

`/auth/me` returns the caller's `organization` (`id`, `name`, `slug`); `organizationId` equals `organization.id` and is kept for compatibility.

Invalid credentials return `401` with `{"message":"Invalid credentials","error":"Unauthorized","statusCode":401}`. A missing, malformed, expired or invalid token returns `401`.

### Vehicles

All vehicle routes require a Bearer token and only ever see the caller's own organization.

```bash
TOKEN=<accessToken from login>

curl -X POST http://localhost:3000/api/v1/vehicles \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"makeId":"<makeId>","modelId":"<modelId>","vehicleTypeId":"<vehicleTypeId>","year":2023,"vin":"1FTBW2CM5HKA12345","licensePlate":"ABC-123"}'

curl 'http://localhost:3000/api/v1/vehicles?page=1&limit=20&makeId=<makeId>&vehicleTypeId=<vehicleTypeId>' -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:3000/api/v1/vehicles/<id> \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"licensePlate":null}'

curl -X DELETE http://localhost:3000/api/v1/vehicles/<id> -H "Authorization: Bearer $TOKEN"
```

Rules: the VIN is 17 characters (digits and letters except I, O, Q) and is stored uppercase. The license plate is optional, stored uppercase, at most 15 characters (letters, digits, spaces, hyphens); `null` clears it on PATCH. The year must be between 1900 and next year. Lists are paginated (`page` default 1, `limit` default 20, max 100), newest first, and can be filtered by `makeId`, `modelId`, `vehicleTypeId` (UUIDv7, exact; unknown ids give an empty list, retired ids still filter) and `year`. Responses return `make`, `model` and `vehicleType` as `{ id, name }`, and never include `organizationId`. Take the ids from the `master-data` endpoints. `makeId`, `modelId` and `vehicleTypeId` are required on create. On PATCH they are optional, and `modelId` is required whenever `makeId` is sent (a model belongs to one make); `null` is `400`. Catalog values are checked only when newly used, so an unchanged retired make, model or type is accepted. Invalid references return `422`: `Vehicle make not found`, `Vehicle make is retired`, `Vehicle model not found for this make`, `Vehicle model is retired`, `Vehicle type not found`, `Vehicle type is retired`. Another organization's vehicle returns `404`, the same as a missing one. `:id` must be a UUIDv7 (otherwise `400`). A duplicate VIN or license plate within the organization returns `409`. A vehicle that has any assignment, maintenance record or fuel log cannot be deleted (`409`, `Vehicle has related records and cannot be deleted`); the history is kept. Vehicle responses also contain `nextServiceDueOn` and `serviceStatus` (see Maintenance, fuel and costs), and `GET /vehicles` accepts a `serviceStatus` filter.

### Roles

Every user has one role: `ADMIN`, `MANAGER` or `DRIVER` (default `DRIVER`).

| Action                             | ADMIN | MANAGER | DRIVER |
| ---------------------------------- | ----- | ------- | ------ |
| Read vehicles                      | yes   | yes     | yes    |
| Create, update, delete vehicles    | yes   | yes     | no     |
| Manage users (`/api/v1/users`)     | yes   | no      | no     |
| Manage drivers and assignments     | yes   | yes     | no     |
| Maintenance, fuel and cost summary | yes   | yes     | no     |
| Change own password                | yes   | yes     | yes    |

A route without `@Roles()` is open to any authenticated user. A role the route does not allow returns `403 Forbidden`. Role checks run before validation, so a forbidden request gets `403` even if its body is invalid. The role is read from the database on every request, not from the token, so a role change or user deletion takes effect on the next request, even with an older token (a deleted user gets `401`).

### Users

All user routes require an ADMIN token and only ever see the caller's own organization. Responses contain `id, firstName, lastName, email, role, createdAt, updatedAt`; never `passwordHash` or `organizationId`.

```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"firstName":"Jo","lastName":"Smith","email":"jo@acme-logistics.test","password":"a-long-password-123","role":"MANAGER"}'

curl 'http://localhost:3000/api/v1/users?role=DRIVER&page=1&limit=20' -H "Authorization: Bearer $TOKEN"

# any role, own password
curl -X PATCH http://localhost:3000/api/v1/auth/me/password \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"FleetOps-dev-123!","newPassword":"a-new-long-password-456"}'
```

Rules: passwords are 12 to 128 characters and are never trimmed. A new password must differ from the current one; a wrong current password returns `400`. Emails are trimmed and lowercased; a duplicate email in the organization returns `409`. Another organization's user returns `404`, the same as a missing one. An admin cannot delete their own account or change their own role (`409`). Existing tokens stay valid after a password change.

### Upgrading to phase 5

The `role` column is added by migration `add_user_role`. Existing users become `DRIVER` until re-seeded or changed by an admin.

```bash
npm run db:migrate
npm run db:seed
npm run db:test:migrate
```

### Drivers and assignments

All routes require an ADMIN or MANAGER token (DRIVER gets `403`) and only ever see the caller's own organization.

```bash
curl -X POST http://localhost:3000/api/v1/drivers \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"firstName":"Kim","lastName":"Lee","licenseNumber":"dl-2001","licenseExpiresOn":"2030-06-30"}'

# assign a driver to a vehicle (start time is set by the server)
curl -X POST http://localhost:3000/api/v1/assignments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"vehicleId":"<vehicleId>","driverId":"<driverId>"}'

# current assignment of a vehicle (drop active=true for the full history)
curl 'http://localhost:3000/api/v1/assignments?vehicleId=<vehicleId>&active=true' -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/v1/assignments/<id>/end -H "Authorization: Bearer $TOKEN"
```

Rules: a driver has `firstName`, `lastName`, a license number (trimmed, stored uppercase, unique per organization, at most 30 characters) and a `licenseExpiresOn` date in `YYYY-MM-DD` form. `userId` optionally links the driver to a login account of the same organization (one driver per user); `null` unlinks on PATCH. Driver responses contain `id, firstName, lastName, licenseNumber, licenseExpiresOn, userId, createdAt, updatedAt`. A license is valid through its expiry date (UTC); a driver with an expired license can be created but not assigned (`422`). A vehicle has at most one active assignment and so does a driver (`409`), enforced both in the service and by partial unique indexes in the database. Assignment times are set by the server. Ending an assignment that already ended returns `409`. Assignment lists accept `vehicleId`, `driverId` and `active=true|false`, newest first. Deleting a driver or vehicle that has any assignment returns `409`. Deleting a user unlinks their driver.

### Upgrading to phase 6

Migration `add_drivers_and_assignments` adds the `drivers` and `vehicle_assignments` tables. `DELETE /api/v1/vehicles/:id` now returns `409` for vehicles that have assignments.

```bash
npm run db:migrate
npm run db:seed
npm run db:test:migrate
```

### Maintenance, fuel and costs

All routes are nested under a vehicle, require an ADMIN or MANAGER token (DRIVER gets `403`, reads included) and only see the caller's own organization. The vehicle must exist in the organization, otherwise `404`.

```bash
curl -X POST http://localhost:3000/api/v1/vehicles/<vehicleId>/maintenance-records \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"OIL_CHANGE","performedOn":"2026-09-30","cost":"89.90","nextServiceDueOn":"2027-03-30"}'

curl -X POST http://localhost:3000/api/v1/vehicles/<vehicleId>/fuel-logs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"fueledOn":"2026-10-01","liters":"45.5","totalCost":"80.00","odometerKm":42100}'

# months default to the 12 months ending with the current UTC month; max 24 months
curl 'http://localhost:3000/api/v1/vehicles/<vehicleId>/cost-summary?from=2026-01&to=2026-12' -H "Authorization: Bearer $TOKEN"
```

Rules:

- Money and volume are decimal **strings** (`"89.90"`, `"45.5"`); a JSON number is rejected with `400`. Responses use fixed scale: 2 decimals for money, 3 for liters (`"45.500"`). There is one currency per organization and no currency field. Cost accepts up to 10 integer digits and 2 decimals (zero allowed); liters up to 5 integer digits and 3 decimals and must be greater than zero.
- Dates are date-only `YYYY-MM-DD`. `performedOn` and `fueledOn` must be on or after 1900-01-01 and no later than tomorrow (UTC). A record's `nextServiceDueOn` must be after its `performedOn` (`400` otherwise, also when a PATCH makes it so).
- Maintenance types: `OIL_CHANGE`, `TIRES`, `BRAKES`, `INSPECTION`, `REPAIR`, `OTHER`. `description` (max 500), `vendor` (max 100), `odometerKm` (0 to 9,999,999) and `nextServiceDueOn` are optional and `null` clears them on PATCH. The odometer is informational only. Fuel logs have no driver.
- Lists are paginated (`page`, `limit` as elsewhere), newest `performedOn` / `fueledOn` first, and accept inclusive `from` / `to` dates (`from` after `to` is `400`). Maintenance lists also accept `type`.
- Service status: `Vehicle.nextServiceDueOn` is the due date of the vehicle's latest maintenance record that has one (by `performedOn`, then creation time), or `null`. `Vehicle.serviceStatus` is `UNKNOWN` (no due date), `OVERDUE` (due before today, UTC), `DUE_SOON` (due from today through the next 14 days) or `OK` (later). Both are recomputed in the same transaction as every maintenance create, update and delete, with the vehicle row locked so concurrent writes stay consistent. They cannot be set through the vehicle endpoints. Maintenance writes also update the vehicle's `updatedAt`.
- A daily job at 02:00 UTC advances `serviceStatus` as time passes. It is the only query that spans organizations, and it only writes the derived `serviceStatus` column (and the row's `updatedAt`). Cost-summary months run from 1900-01 to 2999-12. It does not run at startup; if the API is down at 02:00 the statuses catch up on the next run.
- Cost summary response: `{ from, to, months: [{ month, maintenanceCost, fuelCost, fuelLiters, totalCost }], totals }`. Every month in the range is present (zero-filled) in ascending order; `totalCost` is maintenance plus fuel. `from` / `to` are `YYYY-MM`, from 1900; `from` after `to` or more than 24 months is `400`.

### Dashboard

`GET /dashboard/fleet` (ADMIN or MANAGER) returns organization-wide counts; `GET /dashboard/me` (any role) returns only the caller's own linked driver and active assignment (both `null` when the user is not linked to a driver). `GET /cost-summary` is the fleet-wide version of the per-vehicle cost summary (same `from` / `to` rules, ADMIN or MANAGER).

```bash
curl http://localhost:3000/api/v1/dashboard/fleet -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/v1/dashboard/me -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:3000/api/v1/cost-summary?from=2026-01&to=2026-12' -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:3000/api/v1/drivers?licenseStatus=EXPIRING_SOON' -H "Authorization: Bearer $TOKEN"
```

- Fleet response: `{ asOf, vehicles: { total, serviceStatus: { OK, DUE_SOON, OVERDUE, UNKNOWN } }, drivers: { total, licenseStatus: { VALID, EXPIRING_SOON, EXPIRED } }, assignments: { active } }`. `asOf` is the UTC day used for the license windows.
- Driver responses include `licenseStatus`: `EXPIRED` (expiry before today, UTC), `EXPIRING_SOON` (today through the next 30 days inclusive) or `VALID` (later). `GET /drivers?licenseStatus=` accepts the same three uppercase values; anything else is `400`.

### Upgrading to phase 7

Migration `add_maintenance_and_fuel` adds the `vehicle_service_status` and `maintenance_type` enums, the `maintenance_records` and `fuel_logs` tables, and two vehicle columns (`next_service_due_on`, nullable, and `service_status`, default `UNKNOWN`). Existing vehicles become `UNKNOWN`. Vehicle responses now have 10 fields instead of 8, and `DELETE /api/v1/vehicles/:id` returns `409 Vehicle has related records and cannot be deleted` for vehicles with assignments, maintenance records or fuel logs (the message changed from `Vehicle has assignments ...`). New dependency: `@nestjs/schedule`.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run db:test:migrate
```

### API docs

Swagger UI is served at `/api/docs` and the OpenAPI JSON at `/api/docs-json`. They are mounted in development and test, and not when `NODE_ENV=production`. Schemas are generated from the DTOs by the `@nestjs/swagger` Nest CLI plugin (runs in `nest build` / `nest start`, not in Jest). Protected operations show the bearer scheme.

### Vehicle master data

Makes, models and vehicle types are global catalogs shared by every organization: no `organizationId`, read-only through the API (any authenticated role), and changed only by the seed and migrations, because ADMIN is a per-organization role. Rows are retired (`active: false`), never deleted.

```bash
curl 'http://localhost:3000/api/v1/master-data/vehicle-makes?search=benz' -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/v1/master-data/vehicle-makes/toyota -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:3000/api/v1/master-data/vehicle-makes/<makeId>/models' -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/v1/master-data/vehicle-types -H "Authorization: Bearer $TOKEN"
```

- Lists: `page` / `limit` like other lists, `search` (case-insensitive, anywhere in the name; `%` and `_` are literal), `includeInactive=true` to also return retired rows. Ordered by name. Items are `{ id, name, slug, active }`.
- A model is offered only if it and its make are active: a retired make returns no models unless `includeInactive=true`. An unknown make is `404`, a malformed `makeId` is `400`.
- Vehicle types are a flat list with the same list rules, plus `GET /vehicle-types/:slug` (404 if unknown).
- `vehicles` has required `make_id`, `model_id` (composite FK, so a model always belongs to the vehicle's make) and `vehicle_type_id` columns; the legacy `make` / `model` strings were dropped. The vehicles API reads and writes them (see Vehicles).

### OpenAPI contract (`openapi.json`)

`apps/api/openapi.json` is the committed OpenAPI document and the contract the web app generates its types from. Regenerate it after any DTO or controller change:

```bash
npm run openapi:export   # nest build, then writes openapi.json
```

The export needs no database: the app is created but never initialised, and placeholder `DATABASE_URL` / `JWT_SECRET` values are used only when those variables are unset. CI re-exports the document and fails if `openapi.json` differs from the committed file.

### Error format

Every error response has this shape (the health 503 keeps its health body):

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Vehicle not found",
  "requestId": "0b9f...",
  "timestamp": "2026-10-05T10:00:00.000Z",
  "path": "/api/v1/vehicles/..."
}
```

Validation errors (400) have `message: "Validation failed"` and a `details` array of `{ "field": "email", "messages": ["email must be an email"] }`; nested fields use dotted paths (`items.0.name`). Unexpected errors return 500 `Internal server error`; the original message is never sent, only logged. Unmapped Prisma errors map to 409 (P2002, P2003) and 404 (P2025).

### Request IDs and logging

Every response has an `X-Request-Id` header (an incoming value is kept only if it matches `[A-Za-z0-9._-]{1,64}`, otherwise a UUID is generated) and the error body carries the same `requestId`. One `HTTP` log line is written per completed request with method, path (no query string), status, duration, user, organization and IP. Headers, bodies and query strings are never logged. Logs are JSON when `NODE_ENV=production` and text otherwise; `LOG_LEVEL` sets the minimum level.

### Health probes

- `GET /api/v1/health/live` always returns `200 {"status":"ok","service","timestamp"}`. Use it for liveness probes: a database outage must not restart the process.
- `GET /api/v1/health/ready` returns `{"status","service","timestamp","database":"up|down","migrations":"applied|pending|unknown"}`: `200` only when the database is up and every migration shipped in this build is applied (newer unknown rows are ignored, so old instances stay ready during a rolling deploy), otherwise `503` with the same body. Migration names are only logged. Use it for readiness probes. It reads `prisma/migrations` relative to the working directory, so run the app from the project root (`/app` in the image); otherwise `migrations` is `unknown` and the instance is never ready.

### Rate limiting

`POST /api/v1/auth/login` and `PATCH /api/v1/auth/me/password` return `429 Too many requests, please try again later` with a `Retry-After` header beyond the limits: `THROTTLE_LIMIT` per window per account+IP (login) or per user (password change), and `THROTTLE_IP_LIMIT` per IP. Other routes are not throttled. The counters are in memory and per instance, so with N instances the effective limit is up to N times higher (Redis-backed storage is deferred). Behind a load balancer set `TRUST_PROXY` to the number of proxy hops (for example `1`), otherwise every client shares the proxy's IP. With `0` `X-Forwarded-For` is ignored. Only a hop count is accepted, never `true`, because trusting every hop lets clients spoof their IP and bypass the IP limit.

### Upgrading to phase 8

New dependencies: `@nestjs/swagger` and `@nestjs/throttler`. Add `LOG_LEVEL=warn`, `THROTTLE_LIMIT=1000` and `THROTTLE_IP_LIMIT=1000` to `.env.test` (the e2e suites log in many times from one IP). Error bodies gain `requestId`, `timestamp` and `path`; validation errors move from a `message` array to `message` plus `details`; the health 503 body is unchanged.

```bash
npm install
```

### Upgrading to phase 9

No migration and no new dependency. Optionally add `TRUST_PROXY=0` to `.env` and `.env.test`.

## Docker

The `Dockerfile` has these targets (base `node:24-bookworm-slim`; keep `NODE_VERSION` in sync with the root `.nvmrc`; the build context is `apps/api`):

- `runtime` (default): production dependencies only, runs as the non-root `node` user with `node dist/main.js`, health check on `/api/v1/health/ready`.
- `migrate`: full dependencies, runs `prisma migrate deploy`; also usable for `prisma db seed`.

```bash
# run from the repository root
docker compose up --build                                  # postgres + migrate (once) + api on :3000
docker compose up -d postgres                              # database only, for host development
docker compose run --rm migrate npx prisma db seed         # seed the dev database
```

Compose does not pass `.env` into the containers (each service sets its own variables, and `DATABASE_URL` always points at the compose database), but it does use a `.env` file in the repository root (not `apps/api/.env`) and shell variables for `${...}` interpolation: `API_PORT` (3000), `POSTGRES_PORT` (5432), `POSTGRES_USER`/`POSTGRES_PASSWORD` (fleetops), `JWT_SECRET` (an insecure dev-only default is used otherwise), `LOG_LEVEL`. The compose API runs with `NODE_ENV=development` (Swagger on); the image default is `production`.

## Deployment

1. Build the image.
2. Run the `migrate` target once with the production `DATABASE_URL` (`prisma migrate deploy`). Migrations are never run by the container entrypoint, so several replicas do not race and a failed migration does not crash-loop the fleet.
3. Roll out the `runtime` target. Readiness gates traffic: a new instance is not ready until its migrations are applied.

Probes: `/api/v1/health/live` for liveness, `/api/v1/health/ready` for readiness. Set `TRUST_PROXY` behind a load balancer and provide `DATABASE_URL` and `JWT_SECRET` through the platform's secret store.

### Production: Railway + Neon (API) and Vercel (web)

`.github/workflows/deploy.yml` runs after `CI` succeeds on a push to `main` (or manually from the Actions tab). It deploys the commit CI tested:

1. `migrate`: `npm run db:migrate:deploy` against the production database.
2. `api` (after `migrate`): `railway up apps/api --path-as-root --ci`, which uploads `apps/api` and builds its `Dockerfile` on Railway.
3. `web` (after `api`): `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod` from `apps/web`.

Because migrations run before the new API version starts, they must stay backward compatible with the running version (expand, then contract).

One-time setup:

- **Neon**: create the production database. Use the direct (non `-pooler`) connection string.
- **Railway**: create a project with an **empty** service named `fleetops-api` (not connected to GitHub, so only the workflow deploys). In the service settings, set the variables `DATABASE_URL`, `JWT_SECRET` (`openssl rand -base64 48`) and `TRUST_PROXY=1`, the healthcheck path `/api/v1/health/ready`, and generate a public domain. Create a project token for the `production` environment (Project Settings → Tokens). Railway's config-as-code files are deprecated, so these settings live in the dashboard.
- **Vercel**: in `apps/web`, run `vercel link` to create the project. Leave Root Directory empty and turn off Git auto-deploys (Settings → Git), because the workflow deploys. Add the production env vars `API_BASE_URL` (the Railway public URL, without `/api/v1`) and `SESSION_SECRET`. Create a token (Account Settings → Tokens). `apps/web/.vercel/project.json` holds the org and project IDs.
- **GitHub**: create a `production` environment (Settings → Environments) with the secrets `DATABASE_URL`, `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

Railway's free trial is a one-time $5 credit for 30 days, then $1 per month, which is not enough to keep the API running all month. Plan to upgrade or move hosts after the trial.

### Daily service-status job with several instances

The job takes a transaction-scoped PostgreSQL advisory lock (`pg_try_advisory_xact_lock`). If another instance is already running it, the run is skipped and logged. No extra infrastructure is needed.

## CI

`.github/workflows/ci.yml` (repository root) runs on pushes to `main` and pull requests:

- `api`: lint, unit tests, `db:test:migrate`, e2e tests against a `postgres:18-alpine` service, the build, and a check that the committed `openapi.json` is up to date.
- `docker`: builds the `migrate` target (`apps/api`) and smoke-tests `docker compose up` against `/health/ready`.

Images are not published. Deployment is a separate workflow (see [Deployment](#deployment)).
