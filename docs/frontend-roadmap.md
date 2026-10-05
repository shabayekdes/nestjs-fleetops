# FleetOps Web — Frontend Roadmap

This file plans the FleetOps web frontend: a Next.js application (in this monorepo, `apps/web/`) that consumes the FleetOps NestJS REST API. FE1 is built (see its entry below); the later phases are plans only.

> **Frontend development MUST NOT start until Backend Phase 9 — Docker, CI + Deployment — has been completed and approved.**

Related documents:

- [`PHASES.md`](PHASES.md): the backend roadmap (Phases 1–9). It is the source of truth for what the API does.
- [`product-roadmap.md`](product-roadmap.md): product versions after v1.0, and the master development sequence.
- `CLAUDE.md`: backend conventions. Frontend conventions are in [`apps/web/CLAUDE.md`](../apps/web/CLAUDE.md).

To avoid confusion with the backend roadmap, frontend phases are always called **Frontend Phase N** (FE1–FE9). "Phase N" on its own always means a backend phase.

| Frontend phase | Name                   | Status  | Commit(s) |
| -------------- | ---------------------- | ------- | --------- |
| FE1            | Application foundation | Done    | —         |
| FE2            | Authentication         | Planned | —         |
| FE3            | Application shell      | Planned | —         |
| FE4            | Vehicles               | Planned | —         |
| FE5            | Users + roles          | Planned | —         |
| FE6            | Drivers + assignments  | Planned | —         |
| FE7            | Maintenance + fuel     | Planned | —         |
| FE8            | Dashboard + reporting  | Planned | —         |
| FE9            | Production readiness   | Planned | —         |

---

## Rules

1. **The frontend starts only after Backend Phase 9 is completed and approved.** Until then, no frontend code, scaffold or dependency is added anywhere.
2. **The frontend consumes the existing NestJS API.** It does not connect to PostgreSQL, use Prisma, or call any data source other than the FleetOps API.
3. **No backend business logic in Next.js.** Rules such as "a vehicle has at most one active driver", "an expired license cannot be assigned" or "an admin cannot delete themselves" stay in the API. The frontend shows the API's answer.
4. **No duplicated authorization rules.** The frontend may hide or disable actions a role cannot perform, but only for usability. It must still handle a `403` from every protected call as normal.
5. **The backend is the source of truth for security and permissions.** Hiding a button is never the security mechanism. Every request is authorized by the API.
6. **Development is incremental.** Each phase builds only on the phases before it.
7. **Each frontend phase is implemented, tested, reviewed and committed before the next one starts.** When a phase is done, its entry here is updated with status, commit, what was built, decisions and deferred items, the same way `PHASES.md` is maintained.
8. **No future product features** (billing, notifications, branches, trips, telematics, AI — see `product-roadmap.md`) are built during frontend development unless the user explicitly approves them.
9. **Gaps in the API are fixed in the API.** If a screen needs data the API does not provide, that is a backend change, planned and approved separately. The frontend does not work around it by combining many calls or by guessing.

Before each frontend phase starts, its scope is confirmed with the user and a plan is requested from `cto-esmail`, as for backend phases. Frontend work is done by `fe-dev-ahmed`, reporting to `cto-esmail`.

---

## Architecture direction

These are the decisions that shape every phase. They are recommendations to confirm at FE1, not commitments made now.

### Separate application

The frontend is its own Next.js application (working name `fleetops-web`) and lives in this repository as a monorepo, in `apps/web/`, next to the API in `apps/api/`. It has an independent `package.json` (no npm workspaces) and is deployed separately from the API. **Decision:** monorepo, because it keeps one shared OpenAPI contract, allows atomic API and UI changes, and gives one compose stack.

### Server-side API access (backend-for-frontend)

The browser does not call the NestJS API directly. Next.js server code (Server Components, Server Actions and Route Handlers) calls the API and returns the results to the browser.

- **Why:** the API issues a bearer access token. If the token stays on the Next.js server side in an `httpOnly`, `Secure`, `SameSite=Lax` cookie, browser JavaScript can never read it. Storing it in `localStorage` would expose it to any XSS bug.
- **What it solves:** token storage, attaching the `Authorization` header in one place, and CORS. The API does not enable CORS today, and with this design it does not need to.
- **Fits because:** the API is a stateless bearer-token API with no cookie support of its own, and Next.js App Router has server-side data access built in.
- **Necessary:** yes, from FE2. FE1 builds the server-only API client it depends on.

### Server state over client state

Most data comes from the API. It is fetched on the server per request and not copied into a client-side store. Filters, pagination and the selected tab live in the URL (search parameters), so pages can be shared, bookmarked and reloaded.

### Thin client-side validation

Forms check only what helps the user before submitting: required fields, length, format. The API is still the validator. Every `400`/`409` from the API is shown next to the relevant field or as a form-level message. Client rules that copy API rules (VIN format, year range, password length) are kept small and are considered a convenience, not a guarantee.

---

## Technology decisions

For each choice: why it is needed, what it solves, why it fits, and when it is needed. Versions are chosen when FE1 starts, not now. Any dependency not listed here needs a justification at the time it is proposed.

| Technology                                                                     | Why it is needed / what it solves                                                                               | Why it fits FleetOps                                                                                                                                                                                                    | When                                                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Next.js (App Router)**                                                       | Routing, layouts, server rendering, server-side data access and a production build in one framework.            | The server-side API access design depends on Server Components, Server Actions and Route Handlers. Nested layouts fit a dashboard with a shared shell.                                                                  | Required, FE1. **Chosen: Next.js 16.3 (16.3.8).**                                                                       |
| **TypeScript (strict)**                                                        | Catches contract errors with the API at compile time.                                                           | Same strictness as the backend, so types for API responses can be shared.                                                                                                                                               | Required, FE1.                                                                                                          |
| **ESLint + Prettier**                                                          | Consistent code and a lint gate for the Definition of Done.                                                     | Same tools as the backend.                                                                                                                                                                                              | Required, FE1.                                                                                                          |
| **Environment validation** (e.g. a small schema check at startup)              | The app should refuse to start with a missing or invalid `API_BASE_URL` or session secret, as the backend does. | Same "fail fast on bad config" decision as backend Phase 1.                                                                                                                                                             | Required, FE1. **Chosen: Zod 4 (4.6.5)**, same library as planned for forms.                                            |
| **Generated API types from OpenAPI** (e.g. `openapi-typescript`)               | Types for requests and responses produced from the API's OpenAPI document instead of being written by hand.     | Backend Phase 8 adds OpenAPI docs generated from the DTOs. Generated types stop the frontend and the API from drifting apart.                                                                                           | FE1. **Chosen: openapi-typescript 7.13 with a committed spec (`apps/api/openapi.json`) and committed generated types.** |
| **Styling: Tailwind CSS** (alternative: CSS Modules)                           | Consistent spacing, colour and responsive breakpoints without writing a CSS framework.                          | A dashboard needs many similar, responsive screens. Utility classes keep them consistent. CSS Modules (built into Next.js) is the zero-dependency alternative.                                                          | FE1. **Chosen: Tailwind CSS 4 (4.3.3).**                                                                                |
| **Accessible UI primitives** (e.g. Radix-based components such as shadcn/ui)   | Dialogs, dropdown menus, selects and toasts with correct keyboard and screen-reader behaviour.                  | These are hard to build accessibly by hand and appear from FE2 onward (user menu, delete confirmations, forms). Copy-in components avoid a heavy component-library dependency.                                          | Decide at FE2/FE3, when the first dialog or menu is needed.                                                             |
| **Forms: native forms + Server Actions first**; React Hook Form only if needed | Submitting, showing pending state and mapping API errors to fields.                                             | Most FleetOps forms are small CRUD forms. Server Actions keep the token on the server. A form library is added only if forms with many dependent fields (e.g. assignments, maintenance) become hard to manage.          | Server Actions at FE2. Decide on a form library at FE4–FE6 based on real need.                                          |
| **Schema validation** (e.g. Zod)                                               | One place to describe form input and environment variables, with typed results.                                 | Covers env validation (FE1) and client-side form checks.                                                                                                                                                                | FE1 for env validation. **Chosen: Zod 4**; form checks follow from FE2.                                                 |
| **Data tables** (plain table component first; TanStack Table only if needed)   | Displaying paginated lists.                                                                                     | Pagination, filtering and sorting are done by the API, so the table only renders rows. A table library is needed only if column features (resizing, column visibility, row selection) are required.                     | Plain component at FE4. Library deferred.                                                                               |
| **Client-side data cache** (e.g. TanStack Query)                               | Client-side caching, background refetching, optimistic updates.                                                 | Not needed while data is fetched on the server per request. It may be needed for highly interactive screens.                                                                                                            | Deferred. Adopt only with a concrete screen that needs it.                                                              |
| **Global client state library** (e.g. Zustand)                                 | Shared client-only state.                                                                                       | The current user comes from the server, and filters live in the URL. There is no known need.                                                                                                                            | Not planned.                                                                                                            |
| **Charts** (e.g. Recharts, or a similar lightweight library)                   | Time-series and comparison charts.                                                                              | Only the cost summaries (FE7) and the dashboard (FE8) need charts.                                                                                                                                                      | Deferred to FE7/FE8. Choose based on the actual charts needed.                                                          |
| **Unit/component tests** (e.g. Vitest or Jest + React Testing Library)         | Testing components, form behaviour and API error mapping without a browser.                                     | Matches the backend's unit-test discipline. Choose the runner that works best with the chosen Next.js version, preferring Jest if it works without friction (same runner as the backend).                               | Required, FE1. **Chosen: Vitest 5 + React Testing Library** (the user chose it over Jest).                              |
| **End-to-end tests** (e.g. Playwright)                                         | Testing real flows (login, CRUD, role behaviour) in a browser against a running API.                            | The most important frontend risks (session expiry, 401/403 handling, tenant isolation in the UI) only show up end to end.                                                                                               | Setup at FE2 (first real flow). Expanded at FE9.                                                                        |
| **Authentication library** (e.g. Auth.js)                                      | —                                                                                                               | **Not planned.** The API already authenticates users and issues tokens. A small custom session (an encrypted cookie holding the access token) is simpler than adapting an auth library to an external bearer-token API. | Not needed.                                                                                                             |

---

## Frontend Phase 1 — Application foundation

**Status:** Done (commit pending)

**Goal:** a running Next.js application with the configuration, API client, layout and conventions that every later phase relies on.

**Next.js concepts:** App Router, layouts, `error.tsx` / `loading.tsx` / `not-found.tsx`, Server Components vs Client Components, server-only modules, environment variables.

**Scope**

- Next.js project with App Router, strict TypeScript, ESLint and Prettier.
- Environment configuration validated at startup: at least `API_BASE_URL` (server-only) and, from FE2, a session secret. `.env.example` included. No `NEXT_PUBLIC_` variable holds anything secret.
- Server-only API client foundation:
  - one place that builds URLs from `API_BASE_URL` + `/api/v1`;
  - JSON request/response handling and typed responses;
  - API errors converted to one typed error (`status`, `message`, field messages), based on the backend's error format (NestJS default today, the unified format after backend Phase 8);
  - a request timeout and a clear error when the API is unreachable.
- Root layout, a minimal public page, and global `error`, `loading` and `not-found` handling.
- A check of `/api/v1/health` (e.g. a status indicator on a development-only page) to prove the API connection works.
- Unit test setup with at least one test of the API client's error conversion.
- Frontend conventions document (the frontend's equivalent of `CLAUDE.md`): folder structure, naming, Server vs Client Component rules, how to call the API, testing rules, Definition of Done.
- README: install, env vars, run, test, build.

**Built**

- `apps/web/`: Next.js 16.3.8 (App Router), React 19.2.8, strict TypeScript 5.9.3, Tailwind CSS 4, ESLint 9 + Prettier, with its own `package.json` (no workspaces). Dev server and `next start` use port 3001.
- Environment: `src/lib/env/server.ts` validates `API_BASE_URL` with Zod 4. `src/instrumentation.ts` runs `assertServerEnv()` at startup and exits with `process.exit(1)` if the value is missing or invalid. `.env.example` included.
- Server-only API client (`src/lib/api/client.ts`, `apiRequest`): builds URLs from `API_BASE_URL` + `/api/v1`, handles JSON, returns typed responses and applies a request timeout. Failures are `ApiError` (`status`, `message`, `fieldErrors`, `requestId`) or `ApiConnectionError` (`reason: 'timeout' | 'unreachable'`).
- Generated types: `src/lib/api/generated/openapi.ts` is produced by `npm run api:types` from `apps/api/openapi.json`; `src/lib/api/types.ts` exposes them. A typed `/health` helper lives in `src/lib/api/health.ts`.
- App shell: root layout, minimal public home page, and global `error.tsx`, `global-error.tsx`, `loading.tsx` and `not-found.tsx`.
- `/dev/api-health`: a development-only page that calls `/api/v1/health` and shows the API status.
- Vitest 5 + React Testing Library setup, with tests for the env schema, env assertion, API client, error conversion, health helper, health status component and `not-found`.
- Conventions document `apps/web/CLAUDE.md` and `apps/web/README.md` (install, env vars, run, test, build).
- CI jobs for the web app (format check, lint, typecheck, test, build, generated-types drift check).

**Decisions**

- Exact pins (`.npmrc` `save-exact=true`), with four deliberate holds:
  - React 19.2.8, not 19.3: create-next-app 16.3.8 pins it.
  - TypeScript 5.9.3: openapi-typescript 7.13 has a `^5` peer. The API uses TypeScript 6, which is fine.
  - ESLint 9: the plugins in eslint-config-next 16.3.8 allow at most 9. A deprecation notice is accepted.
  - `@types/node` 24: matches the Node 24 runtime.
- The OpenAPI spec (`apps/api/openapi.json`) and the generated types are both committed. CI checks drift on both sides: the API job re-exports the spec and fails on a diff, and the web job regenerates the types and fails on a diff.
- The OpenAPI export needs no database: the Nest app is created but never `init()`'d, so no lifecycle hook (including the Prisma connection) runs.
- Health responses became DTO classes so the generated health types are precise instead of `unknown`.
- `API_BASE_URL` must be the origin only (for example `http://localhost:3000`). The client adds `/api/v1`.
- Fail-fast env: invalid configuration stops the server at startup through `instrumentation.ts` and `process.exit(1)`, like the backend.
- `ApiError` and `ApiConnectionError` messages never include the base URL, so internal addresses do not leak into pages or logs shown to users.
- `/dev/api-health` is development-only. It is blocked in production by a production-only `rewrites().beforeFiles` rule in `next.config.ts` that sends `/dev/*` to a route that does not exist. The page guards itself too, but `notFound()` called after the root `loading.tsx` has started streaming returns status 200. A rewrite was chosen over moving `loading.tsx` because any future loading boundary would bring the problem back.
- Dev server on port 3001, so it does not clash with the API on 3000.
- Frontend conventions live in `apps/web/CLAUDE.md`, separate from the backend `CLAUDE.md`.
- No CI path filters yet: every job runs on every change.
- `npm audit` reports 5 high findings. They are one `braces` advisory (no patched release) in the dev-only lint chain under `eslint-config-next`. `npm audit --omit=dev` reports 0. Never apply `npm audit fix --force`: it downgrades `eslint-config-next` to 14.

**Backend changes made for FE1**

- Health DTO classes (`health-response.dto.ts`) and `503` documentation on the health endpoint.
- `createOpenApiDocument` helper in `swagger.ts`.
- `src/scripts/export-openapi.ts` and the `npm run openapi:export` script, which write `apps/api/openapi.json`.
- An API CI step that re-exports the spec and fails on drift.
- No behavior or schema change.

**Out of scope / deferred**

- Login and any authenticated page (FE2).
- Navigation shell (FE3).
- Compose `web` service and a web Dockerfile (FE9).
- Playwright e2e tests (FE2).
- CI path filters.
- Upgrades to ESLint 10, TypeScript 6+ and React 19.3, once `eslint-config-next` and openapi-typescript support them.
- An `API_BASE_URL` with a path prefix (revisit in FE9).
- A possible argon2-related flake in API unit tests under heavy load. It was not reproduced; capture the output if it recurs.

---

## Frontend Phase 2 — Authentication

**Status:** Planned

**Goal:** users log in with the existing API, protected pages require a valid session, and expired or invalid sessions are handled cleanly.

**Next.js concepts:** Server Actions, `httpOnly` cookies, middleware/proxy for route protection, redirects, route groups for public vs protected pages.

**Scope**

- Login page with `organizationSlug`, `email` and `password`, calling `POST /api/v1/auth/login` from a Server Action.
- On success, the access token is stored in an encrypted `httpOnly`, `Secure`, `SameSite=Lax` cookie with an expiry matching `expiresIn`. The token is never sent to browser JavaScript.
- On failure, the API's single `Invalid credentials` message is shown as is. The frontend does not try to tell "unknown organization" from "wrong password"; the API deliberately hides that.
- Route protection: every page outside the public group requires a session, otherwise redirect to login (keeping the requested path to return to after login). Route protection is a convenience; the API's `401` remains the real check.
- Current user loaded from `GET /api/v1/auth/me` on the server and made available to the layout. Role is taken from this response, never decoded from the token (the token does not contain the role).
- Logout: delete the session cookie and redirect to login. The backend has no logout or revocation endpoint, so logout is client-side only (see "Dependency on Backend").
- Unauthorized handling: any `401` from the API clears the session and redirects to login with a "session expired" message. Any `403` shows a "not allowed" message without logging the user out.
- Session expiration: the backend issues a 15-minute access token with no refresh token. FE2 handles expiry by sending the user back to login, and must not lose the user's place silently (keep the return path; warn before submitting a form with an expired session where practical).
- E2E test setup with login, logout, protected-route redirect and expired-token cases.

**Out of scope**

- Sign-up, password reset, email verification (not in the backend).
- Refresh tokens or "remember me" (not in the backend; see "Dependency on Backend").
- Password change (FE5).

---

## Frontend Phase 3 — Application shell

**Status:** Planned

**Goal:** an authenticated dashboard layout that every feature page lives in.

**Next.js concepts:** nested layouts, route groups, active links, Client Components for interactive parts only.

**Scope**

- Sidebar navigation, header, and user menu (name, email, role, password change link, logout).
- Organization context in the header. **Gap:** `/auth/me` returns `organizationId` but not the organization's name or slug (see "Dependency on Backend").
- Role-aware navigation: links to sections a role cannot use are hidden (e.g. Users for non-admins). This is a usability choice only; the pages and the API still handle `403`.
- Responsive layout: collapsible sidebar on small screens, usable on a tablet and a phone.
- Empty dashboard home page (filled in FE8).
- Shared building blocks used by later phases: page header, empty state, error state, loading skeleton, confirmation dialog, toast/notice.

**Out of scope**

- Dashboard content and statistics (FE8).
- Theme customization or per-organization branding.

---

## Frontend Phase 4 — Vehicles

**Status:** Planned

**Goal:** the first full CRUD screens, built on the backend Phase 4 vehicles API. This phase sets the pattern for every later resource.

**Next.js concepts:** search-param-driven pages, Server Actions for mutations, revalidation after a mutation, dynamic routes.

**Scope**

- Vehicle list using `GET /api/v1/vehicles`: table, pagination (`page`, `limit`, `meta.total`), and filters for `make`, `model` and `year`, all kept in the URL.
- Vehicle detail page (`GET /api/v1/vehicles/:id`).
- Create and edit forms (`POST`, `PATCH`). Edit sends only changed fields. Clearing the license plate sends `licensePlate: null`, matching the API.
- Delete with a confirmation dialog (`DELETE`, 204).
- Validation: small client-side checks for usability; API `400` field errors and `409` (duplicate VIN or plate) shown on the form.
- Loading, empty ("no vehicles yet" vs "no vehicles match these filters") and error states.
- `404` for a missing vehicle (including another organization's vehicle, which the API reports as `404`).
- Role behaviour: create/edit/delete actions hidden for DRIVER, and a `403` still handled if it happens.
- Tests: list/filter state, form error mapping, E2E create → edit → delete, DRIVER read-only behaviour.

**Out of scope**

- Partial-match search, sorting controls, cursor pagination (not in the API).
- Driver assignment on the vehicle page (FE6).

---

## Frontend Phase 5 — Users + roles

**Status:** Planned

**Goal:** admins manage their organization's users, and every user can change their own password. Built on backend Phase 5.

**Scope**

- User list (`GET /api/v1/users`) with pagination and the `role` filter. Admin-only section.
- Create user (first name, last name, email, password, role); edit user; change role; delete user with confirmation.
- API rules shown, not reimplemented: an admin cannot delete themselves or change their own role (`409`), duplicate email (`409`). The UI may disable these actions on the admin's own row for clarity, but still shows the API's message if it is returned.
- Password change page for every role (`PATCH /api/v1/auth/me/password`, 204): current password, new password, confirmation. Wrong current password (`400`) and "must differ" errors shown on the form.
- After a role change of the current user (by another admin), the next request reflects the new role. The UI reloads the current user and navigation after a `403`.
- Tests: admin CRUD flow; non-admin redirected or shown "not allowed"; password change errors.

**Out of scope**

- Admin password reset, invites by email, custom permissions (not in the backend).

---

## Frontend Phase 6 — Drivers + assignments

**Status:** Planned

**Goal:** manage drivers and see and change which driver uses which vehicle. Built on backend Phase 6. The exact screens follow the API that Phase 6 delivers.

**Scope**

- Driver list and driver detail page, including license number and expiry (with "expired" and "expires soon" shown clearly).
- Create, edit and delete drivers, including linking a driver to a user if the API supports it.
- Vehicle assignments: current assignment on the vehicle and driver pages, assignment history for both.
- Assign and unassign flows. Business rules (one active driver per vehicle, no assignment with an expired license) are enforced by the API; the UI shows the API's error clearly and may warn in advance using data it already has.
- Loading, empty and error states for every list and history.

**Out of scope**

- Trips, GPS or telemetry (product roadmap v2.0+).

---

## Frontend Phase 7 — Maintenance + fuel

**Status:** Planned

**Goal:** record and review running costs per vehicle. Built on backend Phase 7.

**Scope**

- Maintenance records and fuel logs, nested under a vehicle (list, create, edit, delete).
- Vehicle-specific history views with filters (e.g. date range, type), as supported by the API.
- Per-vehicle cost summary (totals by month) from the backend's summary endpoint. A chart only if it is clearer than a table.
- "Service due soon" indicators based on the backend's scheduled-job flag.
- Forms with validation and API error mapping; empty, loading and error states.

**Out of scope**

- Receipt or invoice uploads; email or push notifications (not in the backend).

---

## Frontend Phase 8 — Dashboard + reporting

**Status:** Planned

**Goal:** a fleet overview that answers the questions fleet managers ask most often.

**Scope**

- Fleet overview: number of vehicles, drivers, active assignments.
- Vehicle, maintenance, fuel and driver statistics, such as service due soon, licenses expiring soon, and cost this month vs last month.
- Cost summaries across the fleet.
- Charts only where they make a trend or comparison clearer than a number or a table. Every chart has a text or table equivalent.
- **Dependency:** the backend has no fleet-wide aggregate endpoints. FE8 must not compute statistics by loading every page of every list. The required endpoints are planned and approved as a backend change first (see "Dependency on Backend").

**Out of scope**

- Exportable reports, custom report builders and advanced analytics (product roadmap v1.3).

---

## Frontend Phase 9 — Production readiness

**Status:** Planned

**Goal:** the frontend can be built, tested and deployed automatically, and is secure, accessible and fast enough for real users.

**Scope**

- Production environment configuration and validation; separate values per environment.
- Build validation: production build, type check and lint in CI.
- Error handling review: every page has error, empty and loading states; unexpected errors are reported without leaking API details.
- Performance: reasonable bundle size, Server Components by default, no unnecessary client-side JavaScript, image and font optimization.
- Accessibility: keyboard navigation, focus management in dialogs, labels on all form fields, colour contrast, screen-reader check of core flows (target: WCAG 2.2 AA).
- Responsive behaviour checked on phone, tablet and desktop widths.
- Security review: cookie flags, CSRF protection for Server Actions/Route Handlers, security headers (CSP, frame-ancestors), no secrets in `NEXT_PUBLIC_` variables or client bundles, no token in browser storage or logs.
- API integration review against the final OpenAPI document: every call uses the documented contract; all error statuses handled.
- Frontend unit/component tests and E2E tests for every core flow, run in CI against a real API and test database.
- Deployment (platform chosen at this phase) and CI integration, consistent with backend Phase 9's pipeline.

**Out of scope**

- Product features after v1.0 (see `product-roadmap.md`).

---

## Dependency on Backend

Every frontend phase depends on the backend phases below. All backend phases must be done before FE1 starts (rule 1); this table shows which backend work each screen relies on, and which **gaps** exist today.

| Frontend phase            | Backend capabilities used                                                                                                                                           | Gaps to resolve first (backend changes, need approval)                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE1 Foundation            | Phase 1 `/api` prefix + `v1` versioning, `GET /api/v1/health`; Phase 8 OpenAPI document and unified error format; Phase 9 deployed API to point at.                 | None expected. CORS is not needed with the server-side API access design.                                                                                                                                                                |
| FE2 Authentication        | Phase 3 `POST /auth/login`, `GET /auth/me`, bearer tokens, `401` behaviour; Phase 5 role in `/auth/me`, role re-read on every request; Phase 8 login rate limiting. | **No refresh tokens, logout or revocation** (Phase 3 out of scope). With a 900 s token, users are logged out every 15 minutes. Decide before FE2: accept this, raise `JWT_EXPIRES_IN` (max 86400), or add refresh tokens to the backend. |
| FE3 Shell                 | Phase 5 roles; `/auth/me` profile.                                                                                                                                  | **Organization name is not exposed.** `/auth/me` returns only `organizationId`. A small backend addition (e.g. organization name and slug in `/auth/me`, or `GET /organizations/current`) is needed to show it.                          |
| FE4 Vehicles              | Phase 4 vehicles CRUD, pagination, filters, 404/409 behaviour; Phase 5 write roles (ADMIN, MANAGER).                                                                | None.                                                                                                                                                                                                                                    |
| FE5 Users + roles         | Phase 5 users CRUD, role filter, `PATCH /auth/me/password`, self-delete/self-demotion `409`.                                                                        | None.                                                                                                                                                                                                                                    |
| FE6 Drivers + assignments | Phase 6 drivers, assignments, current and past assignments, assignment rules.                                                                                       | Depends on the final Phase 6 API.                                                                                                                                                                                                        |
| FE7 Maintenance + fuel    | Phase 7 maintenance and fuel CRUD, per-vehicle cost summary, service-due flag.                                                                                      | Depends on the final Phase 7 API.                                                                                                                                                                                                        |
| FE8 Dashboard             | Phases 4–7 data.                                                                                                                                                    | **No fleet-wide aggregate endpoints.** A dashboard/statistics endpoint (or a few) must be designed in the backend.                                                                                                                       |
| FE9 Production            | Phase 8 error format, request IDs (shown in error messages to help support); Phase 9 Docker, CI and deployment.                                                     | The API must accept requests from the deployed frontend's server (network/host configuration, no CORS needed).                                                                                                                           |

---

## Development sequence

The full sequence across backend, frontend and product is at the end of [`product-roadmap.md`](product-roadmap.md#master-development-sequence). For the frontend: **backend Phase 9 done and approved → FE1 → FE2 → … → FE9 → FleetOps v1.0.** Phases are done in order, one at a time.

---

## Template for future frontend phases

```md
## Frontend Phase N — <name>

**Status:** Planned | In progress | Done (`<commit>`)

**Goal:** <one sentence>

**Next.js concepts:** <what this phase teaches>

**Built** / **Scope**

- ...

**Decisions**

- ...

**Out of scope**

- ...
```
