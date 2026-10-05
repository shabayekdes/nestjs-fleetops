# FleetOps

FleetOps is a B2B fleet management platform: vehicles, drivers, assignments, maintenance and fuel records, with multi-tenant organizations.

## Layout

| Path                 | What                                                         |
| -------------------- | ------------------------------------------------------------ |
| `apps/api/`          | NestJS REST API (PostgreSQL, Prisma)                         |
| `apps/web/`          | Next.js web app (planned, not created yet)                   |
| `docs/`              | Phase history and roadmaps                                   |
| `docker-compose.yml` | Local stack: PostgreSQL, migrations and the API              |
| `.github/`           | CI workflows                                                 |

Each app has its own `package.json` and lockfile; there is no root `package.json`. The Node version for all apps is in `.nvmrc`.

## Quick start

```bash
docker compose up --build   # postgres + migrations + API on http://localhost:3000
```

For local development, tests and the full command list, see [`apps/api/README.md`](apps/api/README.md) (run npm commands from `apps/api/`). Project history and plans are in [`docs/`](docs/).
