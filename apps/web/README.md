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

| Variable         | Required | Description                                                                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_BASE_URL`   | yes      | Origin of the FleetOps API, without `/api/v1`, e.g. `http://localhost:3000`. Server-only.                                                    |
| `SESSION_SECRET` | yes      | Encrypts the session cookie. At least 32 characters; generate with `openssl rand -base64 32`. Changing it signs every user out. Server-only. |

## Routes

| Route              | Access    | Purpose                                                                                  |
| ------------------ | --------- | ---------------------------------------------------------------------------------------- |
| `/login`           | public    | Sign-in form (organization, email, password)                                             |
| `/`                | protected | Home page; redirects to `/login` without a valid session                                 |
| `/session-expired` | public    | Route handler that resolves a render-time 401 (clears the cookie or returns to the page) |
| `/dev/api-health`  | public    | Development page, 404 in production (see below)                                          |

Unknown paths are treated as protected: without a session they redirect to `/login?returnTo=...`.

## Authentication

The API issues a bearer access token that lives 15 minutes (no refresh token). The web server stores it encrypted (AES-256-GCM) in the `httpOnly`, `SameSite=Lax` cookie `fleetops_session`; browser JavaScript never sees it. When it expires the user signs in again; the app warns two minutes before.

The cookie is `Secure` in production builds. A production build served over plain `http` on a non-localhost host drops the cookie, so sign-in appears to do nothing; use https (browsers allow `Secure` cookies on `http://localhost`). A `__Host-` cookie prefix is reviewed in FE9.

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
| `npm run test:e2e`     | Playwright e2e tests (see below)                |
| `npm run format`       | Prettier, write                                 |
| `npm run format:check` | Prettier, check only                            |
| `npm run api:types`    | Regenerate API types from `../api/openapi.json` |

## E2E tests

Playwright (Chromium) drives the real web app against the real API and a seeded test database. `npm run test:e2e` builds and starts both servers itself: the API on port 3100 (`NODE_ENV=test`, so it uses `apps/api/.env.test`) and the web app on port 3101. Neither port may be in use.

Preconditions, once (run in `apps/api`; `DATABASE_URL` in `.env.test` must point at a disposable test database):

```bash
cp .env.test.example .env.test        # if missing; then set DATABASE_URL
npm run db:test:migrate
NODE_ENV=test npm run db:seed         # idempotent; creates the acme-logistics users
```

Then, in `apps/web`:

```bash
npx playwright install chromium       # once
npm run test:e2e
```

Test users come from the API seed (organization `acme-logistics`, password `FleetOps-dev-123!`). The e2e suite uses a fixed test `SESSION_SECRET` (`e2e/support/env.ts`) so it can forge cookies for expiry cases.

## API types

Types in `src/lib/api/generated/openapi.ts` are generated from `apps/api/openapi.json`. After an API change: run `npm run openapi:export` in `apps/api`, then `npm run api:types` here, and commit both. Never edit the generated file.
