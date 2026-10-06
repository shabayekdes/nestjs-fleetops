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

| Route                 | Access    | Purpose                                                                                                         |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `/login`              | public    | Sign-in form (organization, email, password)                                                                    |
| `/`                   | protected | Dashboard (empty state) inside the application shell; redirects to `/login` without a valid session             |
| `/vehicles`           | protected | Vehicle list: filters (`make`, `model`, `year`), pagination (`page`, `limit`) and flash notices, all in the URL |
| `/vehicles/new`       | protected | Add vehicle (ADMIN, MANAGER; a DRIVER sees "not allowed")                                                       |
| `/vehicles/[id]`      | protected | Vehicle detail; Edit and Delete for ADMIN and MANAGER                                                           |
| `/vehicles/[id]/edit` | protected | Edit vehicle (ADMIN, MANAGER); sends only the changed fields                                                    |
| `/session-expired`    | public    | Route handler that resolves a render-time 401 (clears the cookie or returns to the page)                        |
| `/dev/api-health`     | public    | Development page, 404 in production (see below)                                                                 |

Unknown paths are treated as protected: without a session they redirect to `/login?returnTo=...`.

## Authentication

The API issues a bearer access token that lives 15 minutes (no refresh token). The web server stores it encrypted (AES-256-GCM) in the `httpOnly`, `SameSite=Lax` cookie `fleetops_session`; browser JavaScript never sees it. When it expires the user signs in again; the app warns two minutes before.

The cookie is `Secure` in production builds. A production build served over plain `http` on a non-localhost host drops the cookie, so sign-in appears to do nothing; use https (browsers allow `Secure` cookies on `http://localhost`). A `__Host-` cookie prefix is reviewed in FE9.

## Application shell

Protected pages live in `src/app/(app)/` and share a layout with a sidebar (from `lg`, 1024px), a header (organization name and user menu) and a navigation drawer below `lg`. Navigation items are in `src/app/(app)/_shell/nav-items.ts`; hiding an item by role is for usability only, the API still enforces permissions. Shared building blocks (page header, empty state, error state, notice, page skeleton, confirm dialog, not allowed, pagination) are in `src/components/`; form pieces (`FormField`, `FormError`, `SubmitButton`) are in `src/components/form/`; `SessionDeadlineProvider` (`src/components/session-deadline.tsx`) shares the session status with the expiry notice and with forms.

## Forms, lists and flash notices

- Forms are native `<form>`s with Server Actions and `useActionState`; there is no form library. Native HTML constraints give instant feedback, Zod runs in the action, and the API has the last word. The action echoes the submitted values back (React resets the form) and maps API errors with `apiErrorToFormState` (`src/lib/forms/`): 400 to field errors, 403/404/409 to a form-level message, 5xx to "service unavailable".
- `SubmitButton` is disabled while submitting and once the browser clock says the session has expired. This is advisory: the API's 401 is the real guard, and on a 401 inside an action the user is sent to login and unsaved input is lost.
- List pages keep filters, pagination and the page size in the URL. Params are parsed leniently (`parseVehicleListParams`): an invalid one is ignored and a warning is shown. Filters are a `next/form` GET form. A list has three empty states: nothing exists, nothing matches the filters, and the page is past the end.
- Success messages after a redirect use an allowlisted `?notice=<key>` param (`src/lib/flash.ts`); an unknown key shows nothing.
- Every id from the URL or an action argument is checked with `isUuid` before it reaches an API path.

## UI components

UI primitives are [shadcn/ui](https://ui.shadcn.com) (new-york style, Radix) copied into `src/components/ui/`; we own that code. `components.json` configures the CLI. Add a component with:

```bash
npx shadcn@4.21.3 add <name>
```

Do not add the CLI as a dependency. After each `add`: remove the `shadcn` devDependency and the `@import "shadcn/tailwind.css"` line if the CLI adds them, pin any `^` version it writes in `package.json`, change `from "cn"` imports to `@/lib/utils`, run `npm run format`, and make sure `npm run lint` passes. Dark mode is not supported (the `dark:` classes in copied files are inert).

New dependencies (exact versions): `radix-ui` 1.7.0, `class-variance-authority` 0.7.1, `cn` 0.4.0, `lucide-react` 1.52.0; dev: `tw-animate-css` 1.4.0.

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

Test users come from the API seed (organization `acme-logistics`, password `FleetOps-dev-123!`; admin `alex@`, manager `morgan@`, driver `sam@`). The e2e suite uses a fixed test `SESSION_SECRET` (`e2e/support/env.ts`) so it can forge cookies for expiry cases.

Data rules for e2e tests that write data (`e2e/support/api.ts` has the API helpers): create everything with a unique name (every vehicle's make is `E2E-<suffix>`), clean it up through the API in `afterEach` (related records first, then the vehicle), sweep leftovers by that make, and never modify or delete seed data.

## API types

Types in `src/lib/api/generated/openapi.ts` are generated from `apps/api/openapi.json`. After an API change: run `npm run openapi:export` in `apps/api`, then `npm run api:types` here, and commit both. Never edit the generated file.
