# FleetOps

FleetOps is a B2B fleet management platform: vehicles, drivers, assignments, maintenance and fuel records, with multi-tenant organizations.

## Layout

| Path                 | What                                                         |
| -------------------- | ------------------------------------------------------------ |
| `apps/api/`          | NestJS REST API (PostgreSQL, Prisma)                         |
| `apps/web/`          | Next.js web app (server-side API access)                     |
| `docs/`              | Phase history and roadmaps                                   |
| `docker-compose.yml` | Local stack: PostgreSQL, migrations and the API              |
| `.github/`           | CI workflows                                                 |

Each app has its own `package.json` and lockfile; there is no root `package.json`. The Node version for all apps is in `.nvmrc`.

## Quick start

```bash
docker compose up --build   # postgres + migrations + API on http://localhost:3000
```

For local development, tests and the full command list, see [`apps/api/README.md`](apps/api/README.md) (run npm commands from `apps/api/`). Project history and plans are in [`docs/`](docs/).

The web app lives in `apps/web/`; run it with `npm ci && npm run dev` from there (API first). See [`apps/web/README.md`](apps/web/README.md).

`apps/api/openapi.json` is the committed API contract. After changing API DTOs or controllers, regenerate it with `npm run openapi:export` in `apps/api/`, then regenerate the web types with `npm run api:types` in `apps/web/`. CI fails if either is out of date.
