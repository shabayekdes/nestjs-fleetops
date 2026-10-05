# FleetOps Web

Next.js (App Router) web app for FleetOps. It calls the FleetOps API from the server only; the browser never talks to the API directly. Conventions: see [CLAUDE.md](CLAUDE.md).

## Requirements

- Node 24 (see the root `.nvmrc`)
- A running FleetOps API (`docker compose up` from the repository root, or `npm run start:dev` in `apps/api`)

## Setup

```bash
npm ci
cp .env.example .env.local
npm run dev   # http://localhost:3001
```

Start the API first (it listens on port 3000). The app refuses to start when the environment is invalid.

## Environment variables

| Variable       | Required | Description                                                                               |
| -------------- | -------- | ----------------------------------------------------------------------------------------- |
| `API_BASE_URL` | yes      | Origin of the FleetOps API, without `/api/v1`, e.g. `http://localhost:3000`. Server-only. |

## Development page

`/dev/api-health` calls `GET /api/v1/health` and shows the result. It exists only in development and returns 404 in a production build.

## Scripts

| Script                 | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Dev server on port 3001                         |
| `npm run build`        | Production build                                |
| `npm start`            | Serve the production build on port 3001         |
| `npm run lint`         | ESLint, no warnings allowed                     |
| `npm run typecheck`    | `next typegen` then `tsc --noEmit`              |
| `npm test`             | Vitest, single run                              |
| `npm run test:watch`   | Vitest in watch mode                            |
| `npm run format`       | Prettier, write                                 |
| `npm run format:check` | Prettier, check only                            |
| `npm run api:types`    | Regenerate API types from `../api/openapi.json` |

## API types

Types in `src/lib/api/generated/openapi.ts` are generated from `apps/api/openapi.json`. After an API change: run `npm run openapi:export` in `apps/api`, then `npm run api:types` here, and commit both. Never edit the generated file.
