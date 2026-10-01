# FleetOps API

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

## Installation

```bash
npm install                    # also runs `prisma generate` (postinstall)
cp .env.example .env
cp .env.test.example .env.test # only needed for e2e/integration tests
```

## Environment Configuration

Configuration is read from environment variables. Values are validated at startup and the application refuses to start if they are invalid. Real environment variables always override values from the `.env` files.

| Variable         | Description                                                                       | Default       |
| ---------------- | --------------------------------------------------------------------------------- | ------------- |
| `NODE_ENV`       | `development`, `production`, or `test`                                            | `development` |
| `PORT`           | HTTP port the API listens on (1–65535)                                            | `3000`        |
| `DATABASE_URL`   | PostgreSQL connection string (**required**)                                       | —             |
| `JWT_SECRET`     | HS256 signing secret, at least 32 chars (**required**). `openssl rand -base64 48` | —             |
| `JWT_EXPIRES_IN` | Access token lifetime in seconds (60–86400)                                       | `900`         |

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

## Database (Prisma)

| File                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `prisma/schema.prisma`  | Data model (source of truth)                                      |
| `prisma/migrations/`    | Generated SQL migrations — committed, never edited after applied  |
| `prisma/seed.ts`        | Idempotent development seed                                       |
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
```

`prisma migrate dev` is for development only — it may prompt to reset the database on drift. Deployed environments use `prisma migrate deploy`.

### Development Seed Data

> **DEVELOPMENT ONLY.** All data is fictional. The password is public. The seed refuses to run when `NODE_ENV=production`.

| Organization   | Slug             |
| -------------- | ---------------- |
| Acme Logistics | `acme-logistics` |

| User           | Email                      | Password            |
| -------------- | -------------------------- | ------------------- |
| Alex Fleetwood | `alex@acme-logistics.test` | `FleetOps-dev-123!` |
| Sam Driver     | `sam@acme-logistics.test`  | `FleetOps-dev-123!` |

Plus three vehicles (Ford Transit, Mercedes-Benz Sprinter, Volvo FH16 — the latter without a license plate). Passwords are stored as Argon2id hashes. Records are upserted on their natural keys (`slug`, `organizationId + email`, `organizationId + vin`), so re-running the seed never duplicates data.

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
npm run format      # Prettier
```

## API Endpoints

All routes are served under the `/api` prefix with URI versioning (default version `v1`).

| Method | Path                   | Description                                      |
| ------ | ---------------------- | ------------------------------------------------ |
| GET    | `/api/v1`              | Confirms the API is running                      |
| GET    | `/api/v1/health`       | Application + database health (200 / 503)        |
| POST   | `/api/v1/auth/login`   | Public. Exchange credentials for an access token |
| GET    | `/api/v1/auth/me`      | Bearer token. Current user profile               |
| GET    | `/api/v1/vehicles`     | Bearer token. List vehicles (paginated, filters) |
| POST   | `/api/v1/vehicles`     | Bearer token. Create a vehicle                   |
| GET    | `/api/v1/vehicles/:id` | Bearer token. Get a vehicle                      |
| PATCH  | `/api/v1/vehicles/:id` | Bearer token. Partially update a vehicle         |
| DELETE | `/api/v1/vehicles/:id` | Bearer token. Delete a vehicle (204)             |

Every endpoint except `/api/v1` and `/api/v1/health` requires an `Authorization: Bearer <token>` header.

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
```

Invalid credentials return `401` with `{"message":"Invalid credentials","error":"Unauthorized","statusCode":401}`. A missing, malformed, expired or invalid token returns `401`.

### Vehicles

All vehicle routes require a Bearer token and only ever see the caller's own organization.

```bash
TOKEN=<accessToken from login>

curl -X POST http://localhost:3000/api/v1/vehicles \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"make":"Ford","model":"Transit","year":2023,"vin":"1FTBW2CM5HKA12345","licensePlate":"ABC-123"}'

curl 'http://localhost:3000/api/v1/vehicles?page=1&limit=20&make=ford' -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:3000/api/v1/vehicles/<id> \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"licensePlate":null}'

curl -X DELETE http://localhost:3000/api/v1/vehicles/<id> -H "Authorization: Bearer $TOKEN"
```

Rules: the VIN is 17 characters (digits and letters except I, O, Q) and is stored uppercase. The license plate is optional, stored uppercase, at most 15 characters (letters, digits, spaces, hyphens); `null` clears it on PATCH. The year must be between 1900 and next year. Lists are paginated (`page` default 1, `limit` default 20, max 100), newest first, and can be filtered by `make`, `model` (case-insensitive, exact) and `year`. Responses never include `organizationId`. Another organization's vehicle returns `404`, the same as a missing one. `:id` must be a UUIDv7 (otherwise `400`). A duplicate VIN or license plate within the organization returns `409`.
