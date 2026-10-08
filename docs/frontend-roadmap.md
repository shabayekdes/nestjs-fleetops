# FleetOps Web — Frontend Roadmap

This file plans the FleetOps web frontend: a Next.js application (in this monorepo, `apps/web/`) that consumes the FleetOps NestJS REST API. FE1 and FE2 are built (see their entries below); the later phases are plans only.

> **Frontend development MUST NOT start until Backend Phase 9 — Docker, CI + Deployment — has been completed and approved.**

Related documents:

- [`PHASES.md`](PHASES.md): the backend roadmap (Phases 1–9). It is the source of truth for what the API does.
- [`product-roadmap.md`](product-roadmap.md): product versions after v1.0, and the master development sequence.
- [`mongodb-microservices-track.md`](mongodb-microservices-track.md): a learning track that runs **in parallel** with the frontend. The frontend does not depend on it, and no frontend phase waits for it.
- [`advanced-backend-roadmap.md`](advanced-backend-roadmap.md): the Advanced Backend Engineering Track (A1–A12), after the learning track. No frontend phase depends on it. Its UI work (live tracking, maps, geofences, notifications in A5–A8) starts only after FE9 and is recorded in that file, not as new frontend phases.
- `CLAUDE.md`: backend conventions. Frontend conventions are in [`apps/web/CLAUDE.md`](../apps/web/CLAUDE.md).

To avoid confusion with the backend roadmap, frontend phases are always called **Frontend Phase N** (FE1–FE10). "Phase N" on its own always means a backend phase.

| Frontend phase | Name                      | Status  | Commit(s)            |
| -------------- | ------------------------- | ------- | -------------------- |
| FE1            | Application foundation    | Done    | `27b8860`            |
| FE2            | Authentication            | Done    | `be2e028`            |
| FE3            | Application shell         | Done    | `fcd16bb`            |
| FE4            | Vehicles                  | Done    | `fa31a81`            |
| FE5            | Users + roles             | Done    | `499fa7d`            |
| FE6            | Drivers + assignments     | Done    | `970993c`            |
| FE7            | Maintenance + fuel        | Done    | `e2f2bfa`            |
| FE8            | Dashboard + reporting     | Done    | `04c0178`, `c02f2ff` |
| FE9            | Production readiness      | Planned | —                    |
| FE10           | Vehicle master data forms | Planned | —                    |

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

| Technology                                                                     | Why it is needed / what it solves                                                                               | Why it fits FleetOps                                                                                                                                                                                                    | When                                                                                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js (App Router)**                                                       | Routing, layouts, server rendering, server-side data access and a production build in one framework.            | The server-side API access design depends on Server Components, Server Actions and Route Handlers. Nested layouts fit a dashboard with a shared shell.                                                                  | Required, FE1. **Chosen: Next.js 16.3 (16.3.8).**                                                                                                             |
| **TypeScript (strict)**                                                        | Catches contract errors with the API at compile time.                                                           | Same strictness as the backend, so types for API responses can be shared.                                                                                                                                               | Required, FE1.                                                                                                                                                |
| **ESLint + Prettier**                                                          | Consistent code and a lint gate for the Definition of Done.                                                     | Same tools as the backend.                                                                                                                                                                                              | Required, FE1.                                                                                                                                                |
| **Environment validation** (e.g. a small schema check at startup)              | The app should refuse to start with a missing or invalid `API_BASE_URL` or session secret, as the backend does. | Same "fail fast on bad config" decision as backend Phase 1.                                                                                                                                                             | Required, FE1. **Chosen: Zod 4 (4.6.5)**, same library as planned for forms.                                                                                  |
| **Generated API types from OpenAPI** (e.g. `openapi-typescript`)               | Types for requests and responses produced from the API's OpenAPI document instead of being written by hand.     | Backend Phase 8 adds OpenAPI docs generated from the DTOs. Generated types stop the frontend and the API from drifting apart.                                                                                           | FE1. **Chosen: openapi-typescript 7.13 with a committed spec (`apps/api/openapi.json`) and committed generated types.**                                       |
| **Styling: Tailwind CSS** (alternative: CSS Modules)                           | Consistent spacing, colour and responsive breakpoints without writing a CSS framework.                          | A dashboard needs many similar, responsive screens. Utility classes keep them consistent. CSS Modules (built into Next.js) is the zero-dependency alternative.                                                          | FE1. **Chosen: Tailwind CSS 4 (4.3.3).**                                                                                                                      |
| **Accessible UI primitives** (e.g. Radix-based components such as shadcn/ui)   | Dialogs, dropdown menus, selects and toasts with correct keyboard and screen-reader behaviour.                  | These are hard to build accessibly by hand and appear from FE2 onward (user menu, delete confirmations, forms). Copy-in components avoid a heavy component-library dependency.                                          | **Chosen (FE3):** shadcn/ui (new-york) on `radix-ui` 1.7.0, with `class-variance-authority` 0.7.1, `cn` 0.4.0, `lucide-react` 1.52.0, `tw-animate-css` 1.4.0. |
| **Forms: native forms + Server Actions first**; React Hook Form only if needed | Submitting, showing pending state and mapping API errors to fields.                                             | Most FleetOps forms are small CRUD forms. Server Actions keep the token on the server. A form library is added only if forms with many dependent fields (e.g. assignments, maintenance) become hard to manage.          | **No form library (FE4):** native forms, Server Actions, `useActionState` and Zod in the action. Revisit only if a later form becomes hard to manage.         |
| **Schema validation** (e.g. Zod)                                               | One place to describe form input and environment variables, with typed results.                                 | Covers env validation (FE1) and client-side form checks.                                                                                                                                                                | FE1 for env validation. **Chosen: Zod 4**; form checks follow from FE2.                                                                                       |
| **Data tables** (plain table component first; TanStack Table only if needed)   | Displaying paginated lists.                                                                                     | Pagination, filtering and sorting are done by the API, so the table only renders rows. A table library is needed only if column features (resizing, column visibility, row selection) are required.                     | **Plain shadcn `table` (FE4).** Library deferred.                                                                                                             |
| **Client-side data cache** (e.g. TanStack Query)                               | Client-side caching, background refetching, optimistic updates.                                                 | Not needed while data is fetched on the server per request. It may be needed for highly interactive screens.                                                                                                            | Deferred. Adopt only with a concrete screen that needs it.                                                                                                    |
| **Global client state library** (e.g. Zustand)                                 | Shared client-only state.                                                                                       | The current user comes from the server, and filters live in the URL. There is no known need.                                                                                                                            | Not planned.                                                                                                                                                  |
| **Charts** (e.g. Recharts, or a similar lightweight library)                   | Time-series and comparison charts.                                                                              | Only the cost summaries (FE7) and the dashboard (FE8) need charts.                                                                                                                                                      | No library (FE8): a server-rendered SVG chart. Recharts 3.10.1 was considered and rejected.                                                                   |
| **Unit/component tests** (e.g. Vitest or Jest + React Testing Library)         | Testing components, form behaviour and API error mapping without a browser.                                     | Matches the backend's unit-test discipline. Choose the runner that works best with the chosen Next.js version, preferring Jest if it works without friction (same runner as the backend).                               | Required, FE1. **Chosen: Vitest 5 + React Testing Library** (the user chose it over Jest).                                                                    |
| **End-to-end tests** (e.g. Playwright)                                         | Testing real flows (login, CRUD, role behaviour) in a browser against a running API.                            | The most important frontend risks (session expiry, 401/403 handling, tenant isolation in the UI) only show up end to end.                                                                                               | **Chosen: Playwright 1.63.0 (Chromium)**, set up in FE2 with a CI job. Expanded at FE9.                                                                       |
| **Authentication library** (e.g. Auth.js)                                      | —                                                                                                               | **Not planned.** The API already authenticates users and issues tokens. A small custom session (an encrypted cookie holding the access token) is simpler than adapting an auth library to an external bearer-token API. | Not needed.                                                                                                                                                   |

---

## Frontend Phase 1 — Application foundation

**Status:** Done (`27b8860`)

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

**Status:** Done (`be2e028`)

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

**Built**

- Login page (`/login`, route group `(public)`) with organization, email and password. A Server Action calls `POST /api/v1/auth/login`; the form uses `useActionState` with a pending state, native input constraints, and a thin Zod check in the action before the API call.
- Encrypted session cookie `fleetops_session` (`httpOnly`, `SameSite=Lax`, `Secure` in production, `path=/`, `maxAge` = `expiresIn`). It holds only `{ accessToken, expiresAt }`, encrypted with AES-256-GCM via `node:crypto` (`src/lib/auth/session-crypto.ts`). The key is derived with HKDF from the new `SESSION_SECRET` env var (min 32 characters, validated at startup). Sessions count as expired 30 s early.
- Route protection in `src/proxy.ts` (the Next.js 16 replacement for middleware). It is an optimistic cookie check: every non-public GET without a valid session redirects to `/login?returnTo=…`, and an expired or invalid cookie is deleted and the user sees "session expired". Proxy also sets an always-overwritten `x-fleetops-pathname` request header for the return path. Public: `/login`, `/session-expired`, `/dev/*`.
- Return-path handling with open-redirect protection (`safeReturnTo`), used by the proxy, the login page and action, and `/session-expired`. The normalized result is checked again, so dot segments such as `/.//evil.com` cannot become a protocol-relative URL.
- Protected route group `(app)`: the layout loads the current user from `GET /api/v1/auth/me` (`getCurrentUser`, React `cache`) and shows a minimal bar (name, role, Sign out). The home page `/` moved here and is now protected.
- `sessionApiRequest` (`src/lib/auth/session-api.ts`): attaches the bearer token. A 401 during render redirects to the `/session-expired` route handler, which checks `/auth/me`, then either clears the cookie and goes to login with "session expired" and the return path, or returns to the page. A 401 in a Server Action deletes the cookie and redirects directly. 403 is rethrown; the `NotAllowed` component and `NOT_ALLOWED_MESSAGE` show it without logging out.
- Logout Server Action: deletes the cookie and redirects to `/login?reason=signed-out`.
- Session expiry notice (`SessionExpiryNotice`): a warning two minutes before expiry and an alert with a sign-in link (keeping the current path) at expiry. It receives only the remaining time.
- `apiRequest` gained an `accessToken` option; generated types gained `LoginRequest`, `LoginResponse`, `CurrentUser`, `Role`.
- Tests: Vitest unit and component tests for session crypto, session cookies, env, return-path sanitizing, proxy, `sessionApiRequest`, current user, `/session-expired`, login action, login form and page, logout, expiry notice and `NotAllowed`. Playwright e2e (`e2e/auth.spec.ts`, Chromium): login and return path, cookie flags, invalid credentials, driver role, logout, expired cookie, API 401 on a valid-looking cookie, tampered cookie, unsafe `returnTo`, authenticated `/login`.
- CI: a new `web-e2e` job (Postgres service, migrate and seed the test DB, Playwright Chromium, report artifact on failure).
- Docs: `apps/web/README.md` (env, routes, authentication, e2e) and `apps/web/CLAUDE.md` (route groups, authenticated calls, Authentication section, Playwright, DoD).

**Decisions**

- The API's 15-minute access token is accepted as is (user decision). No refresh token, no longer `JWT_EXPIRES_IN`, no backend change. Expiry means signing in again, with the return path kept and a warning beforehand.
- Session encryption uses `node:crypto` AES-256-GCM instead of `jose`: the Next.js 16 proxy runs on the Node.js runtime, so no new dependency is needed.
- A cookie cannot be changed during Server Component render, so a render-time 401 goes through the `/session-expired` Route Handler. It confirms the session is dead with `/auth/me` before clearing it, so a crafted link cannot sign out a valid session and there is no redirect loop.
- Proxy only redirects GET/HEAD. Server Actions are never redirected by proxy (a 307 would replay the POST); they check the session themselves through `sessionApiRequest` in `action` mode.
- `forbidden()`/`unauthorized()` are not used (still experimental in 16.3).
- Client-side form checks are native HTML constraints; Zod runs in the Server Action, keeping it out of the client bundle and sparing rate-limit attempts.
- `Secure` is set only in production builds, so `next dev` works over http. A production build over plain http on a non-localhost host drops the cookie (documented).
- Accessible UI primitives (shadcn/Radix) were deferred to FE3 (chosen there): FE2 has no dialog or menu.
- E2E runs against a production build of the web app (port 3101) and the API in test mode (port 3100), using the idempotent API dev seed on the test database as fixture data. The ports avoid clashing with dev servers on 3000/3001. E2E joined CI in FE2 because session and 401 handling regress silently.
- A render-time redirect after streaming starts (root `loading.tsx`) becomes a client-side redirect with status 200 and may log "destination stream closed early". This is accepted; proxy gives real 307s for the common cases.
- The login API is rate limited per IP. Behind the web server, all users share the web server's IP. The web app does not forward `X-Forwarded-For` (it would be spoofable while the API is publicly reachable).
- `@playwright/test` 1.63.0 is the only new dependency (dev).

**Out of scope / deferred**

- Refresh tokens, "remember me", server-side logout/revocation (not in the backend). A copied cookie stays usable until the token expires (at most 15 minutes).
- Sign-up, password reset, email verification (not in the backend). ~~Password change~~ Done in FE5.
- ~~Disabling individual form submits when the session has expired~~ Done in FE4 (`SubmitButton` and `SessionDeadlineProvider`).
- Application shell, navigation and user menu (done in FE3).
- `__Host-` cookie prefix, CSP and the full security review (FE9).
- **Login rate limiting behind the web server (decide before production, FE9):** the API's per-IP login limit (30 per 60 s) is shared by all web users. `PATCH /auth/me/password` also has a per-IP throttle (30 per 60 s, plus 5 per 60 s per user in production), shared the same way. Fix with deployment configuration (private API network + `TRUST_PROXY` + forwarded client IP) or a backend limit change, planned separately.
- The `web-e2e` CI job was verified locally only; confirm its first GitHub run.
- Firefox/WebKit e2e and broader e2e coverage (FE9).

---

## Frontend Phase 3 — Application shell

**Status:** Done (`fcd16bb`)

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

**Built**

- Backend change: `GET /auth/me` also returns `organization: { id, name, slug }` (`MeOrganizationDto`); `organizationId` is kept. OpenAPI and generated types updated (`CurrentOrganization`).
- shadcn/ui (new-york, Radix) set up: `components.json`, `src/lib/utils.ts`, and `src/components/ui/` with button, dropdown-menu, sheet, alert-dialog, skeleton. Light theme tokens in `globals.css`; no dark mode.
- Building blocks in `src/components/`: `PageHeader`, `EmptyState`, `ErrorState`, `Notice`, `PageSkeleton`, `ConfirmDialog`.
- Shell in `src/app/(app)/_shell/`: role-aware `nav-items`, `SidebarNav` (active link via `usePathname`, `aria-current`), `MobileNav` (Sheet drawer below `lg`), `UserMenu` (name, email, role, organization, Sign out), `AppHeader`, `ShellUser`. `(app)/layout.tsx` has a skip link, sidebar, header, session notice and `<main id="main-content">`; `(app)/loading.tsx` and `(app)/error.tsx` added. The dashboard page is an empty state.
- Tests: unit and component tests for all of the above, jsdom stubs for Radix, Playwright `e2e/shell.spec.ts` (desktop, user menu, driver nav, phone and tablet drawer, skip link, expiry warning) and updated `e2e/auth.spec.ts`.
- New dependencies (exact): `radix-ui` 1.7.0, `class-variance-authority` 0.7.1, `cn` 0.4.0, `lucide-react` 1.52.0, dev `tw-animate-css` 1.4.0. The shadcn CLI is run with `npx shadcn@4.21.3` and is not a dependency.

**Decisions**

- shadcn/ui on Radix; copied components are owned code.
- The "Change password" item was left out of the user menu until FE5. Done in FE5.
- Inline `Notice` instead of a toast library; revisit when a flow needs transient feedback.
- "Collapsible" means a Sheet drawer below `lg` (1024px); no icon-collapse on desktop.
- The nav shows only Dashboard for now. Planned items: FE4 Vehicles (all roles); FE5 Users (ADMIN only); FE6 Drivers and Assignments (ADMIN, MANAGER); FE7 nothing top-level (maintenance and fuel live under a vehicle). Role filtering is usability only.
- Pages that need the user call the cached `getCurrentUser()` again rather than receiving it from the layout. Only `ShellUser` reaches Client Components.
- `ConfirmDialog.onConfirm` may return `{ error }`, shown inline while the dialog stays open.

**Deferred**

- Toast library, ~~password change link~~ (done in FE5), nav items for later phases, dashboard content (FE8), dark mode, desktop icon-collapse sidebar.

---

## Frontend Phase 4 — Vehicles

**Status:** Done (`fa31a81`)

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

**Built**

- Routes under `src/app/(app)/vehicles/`: list (`/vehicles`), detail (`/vehicles/[id]`), `new`, `[id]/edit` and a segment `not-found.tsx`. Route-private `_components/` (form, filters, table) and `_lib/` (list params, Zod schema and edit diff, API wrappers, `canManageVehicles`); Server Actions in `actions.ts` (`createVehicle`, `updateVehicle`, `deleteVehicle`).
- Shared: `lib/search-params.ts`, `lib/ids.ts` (`isUuid`), `lib/forms/` (`FormState`, `apiErrorToFormState`), `lib/flash.ts`, `lib/format.ts`; components `FormField`, `FormError`, `SubmitButton`, `Pagination`, `SessionDeadlineProvider`; shadcn `input`, `label`, `table`. `SessionExpiryNotice` now reads the shared session status.
- Nav item "Vehicles" for every role.
- Tests: unit and component tests for all of the above; Playwright `e2e/vehicles.spec.ts` (create, edit, delete; 409 duplicate VIN; API 400 field error; delete blocked by a 409; driver and manager roles; 404s; filters and pagination in the URL; submit disabled after expiry) with API helpers in `e2e/support/api.ts`.
- No new npm dependency.

**Decisions**

- Success feedback is an inline `Notice` driven by an allowlisted `?notice=<key>` param; no toast library.
- `serviceStatus`, `nextServiceDueOn` and the `serviceStatus` filter are left out; FE7 adds them.
- A 409 is shown at form level with the API's message; the message text is never matched.
- API 400 messages are shown exactly as the API sends them.
- `?limit` is honoured from the URL (1 to 100, default 20); there is no page-size selector.
- A DRIVER opening `/vehicles/new` or `/vehicles/[id]/edit` sees "not allowed" straight away (the edit page fetches nothing first). A 403 from the API is still handled.
- No form library and no table library. Zod runs only in the Server Actions; native constraints cover instant feedback.
- Edit sends only changed fields, compared after normalization; no change means no API call. A cleared plate is sent as `null`; on create an empty plate is left out (the API rejects `""`).
- List params are parsed leniently with a warning instead of a redirect or an error page.
- A 400 on `GET /vehicles/:id` (malformed id) is treated as not found, and ids are checked with `isUuid` before any API call.
- A 401 inside a Server Action redirects to login and loses unsaved input.

**Deferred**

- Service status and next-service date on vehicles (FE7), vehicle search beyond exact make/model/year, sorting controls.
- A page-size selector, toasts.
- Expiry detection uses the browser clock, so it is advisory; the API's 401 is the real guard.

---

## Frontend Phase 5 — Users + roles

**Status:** Done (`499fa7d`)

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

**Built**

- Routes under `src/app/(app)/users/`: list, detail (`[id]`), `new`, `[id]/edit` and a segment `not-found.tsx`; `src/app/(app)/account/password/` (page, `changePassword` action, form, schema). Route-private `_components/` (form, filters, table), `_lib/` (list params, Zod schema and edit diff, API wrappers, `canManageUsers`) and `actions.ts` (`createUser`, `updateUser`, `deleteUser`).
- Shared: `lib/list-params.ts` (page and limit parsing, moved out of vehicles with no behaviour change), `ROLES` and `isRole`, user API types, flash keys, `RefreshOnMount`, `NativeSelect` (shadcn `native-select`), `NotAllowed` rebuilt on `Notice`. Users nav item (ADMIN) and a "Change password" item in the user menu.
- Tests: unit and component tests for all of the above; Playwright `e2e/users.spec.ts` (admin CRUD, duplicate email, API 400, own record, non-admin, demoted admin on the render path and the action path, 404s, own-name update in the shell, URL state), `e2e/password.spec.ts`, and updated `e2e/shell.spec.ts`. API helpers for users in `e2e/support/api.ts`.
- No new npm dependency.

**Decisions**

- D1: the role is changed in the edit form (one native select, same edit diff).
- D2: on your own record the role select and the Delete button are disabled, each with a hint. The API's 409 is still handled: the dialog's error display is unit tested, and the self-delete rule itself is tested at the API level in e2e (a `DELETE` with the user's own token returns 409), because React ignores clicks on a disabled button. `isSelf` is worked out on the server. A missing `role` in the form means unchanged.
- D3: after a 403, `NotAllowed` refreshes the router once and `apiErrorToFormState` calls `refresh()` (Server Actions). Verified in e2e (demoted admin, both paths); the `forbidden` flag fallback was not needed.
- D4: `NativeSelect`, not Radix Select.
- D5: passwords are never echoed or given a default value.
- D6: the password 400s without `details` (wrong current password, must differ) show at form level with the API text.
- D7: Zod checks only trim, not empty and length for the email; the browser (`type=email`) and the API check the format.
- The only browser-side password check is that the confirmation matches; "must differ from the current password" is the API's rule.
- Creating a user: no role is preselected ("Choose a role", required).
- A detail page `/users/[id]` exists, like vehicles; Delete lives there. After a password change the user is redirected to `/account/password` with "Password changed.".
- Users pages check the role before any fetch. Mutations revalidate the root layout so the header shows a new name.

**Deferred**

- Changing a password does not revoke other sessions; they stay valid for up to 15 minutes (backend limitation).
- Raw API wording is shown to users. The per-IP password throttle is shared by all web users in production (FE9).
- Admin password reset, invites by email, custom permissions (not in the backend).

---

## Frontend Phase 6 — Drivers + assignments

**Status:** Done (`970993c`)

**Goal:** manage drivers and see and change which driver uses which vehicle. Built on backend Phase 6. The exact screens follow the API that Phase 6 delivers.

**Scope**

- Driver list and driver detail page, including license number and expiry (with "expired" and "expires soon" shown clearly).
- Create, edit and delete drivers, including linking a driver to a user if the API supports it.
- Vehicle assignments: current assignment on the vehicle and driver pages, assignment history for both.
- Assign and unassign flows. Business rules (one active driver per vehicle, no assignment with an expired license) are enforced by the API; the UI shows the API's error clearly and may warn in advance using data it already has.
- Loading, empty and error states for every list and history.

**Out of scope**

- Trips, GPS or telemetry (product roadmap v2.0+).

**Built**

- Routes under `src/app/(app)/drivers/`: list, detail (`[id]`), `new`, `[id]/edit`, a segment `not-found.tsx`; `src/app/(app)/assignments/`: a read-only list with an All, Current or Ended filter. Route-private `_components/`, `_lib/` (list params, Zod schema and edit diff, API wrappers, `canManageDrivers`, the login-account picker) and `actions.ts` (`createDriver`, `updateDriver`, `deleteDriver`).
- Shared: `components/assignments/` (`AssignmentSection`, `AssignForm`, `EndAssignmentButton`, `AssignmentHistoryTable`), `LicenseStatusBadge`, shadcn `badge`, `lib/license-status.ts`, `formatDateOnly`, `lib/assignments/` (`actions.ts`, `assignments-api.ts`, labels, permissions), `Pagination` `pageParam`, flash keys, and the Drivers and Assignments nav items (ADMIN, MANAGER). The vehicle detail page gained the Assignment section (ADMIN, MANAGER only; a DRIVER makes no assignment call).
- Tests: unit and component tests for all of the above; Playwright `e2e/drivers.spec.ts`, `e2e/assignments.spec.ts` and an updated `e2e/shell.spec.ts`; a Playwright `globalTeardown` that runs the API's test-only `npm run db:test:e2e-cleanup`.
- No new npm dependency.

**Decisions**

- Q1: the API cannot delete assignments, so e2e drivers and vehicles that were ever assigned cannot be removed through the API. A test-only script (`apps/api/prisma/e2e-cleanup.ts`, `npm run db:test:e2e-cleanup`) removes rows named `E2E-*` (and users `e2e-*`); the Playwright `globalTeardown` runs it. Tests also clean up through the API first.
- Q2: a top-level, read-only `/assignments` page with a status filter. Assign and end stay on the vehicle and driver pages.
- Q3: "Expires soon" means 30 days, inclusive, in UTC. The frontend computes it for display only; the API's 422 is the authority and the assign button is never disabled because of it.
- Q4: only an ADMIN can link a login account (a MANAGER cannot list users, so the field is not shown and `userId` is never sent).
- Q5: the account picker lists users of all roles, newest first, at most 100.
- Q6: vehicle and driver pickers are capped at 100 with no search, plus a hint when truncated.
- Pickers do not mark busy vehicles or drivers; the API's 409 covers it. An expired license is labelled in the driver picker, never blocked.
- Detail pages use a separate `assignmentsPage` search param for the past assignments (10 per page).
- Mutations that change assignments revalidate the root layout (both detail pages and `/assignments` change).

**Deferred**

- Search and filters for drivers, vehicles in pickers, and "available" filters (API gaps).
- A driver cannot see their own assignment (API gap; FE8 or later).

**Backend gaps recorded**

1. No way to delete assignments (handled by the test cleanup script).
2. No driver search or filters, and no "available" filters. (License status filter added in FE8.)
3. ~~No license status from the API~~ Resolved in FE8: the API returns `licenseStatus`.
4. The driver response has no user summary.
5. A MANAGER cannot list users.
6. ~~A DRIVER cannot see their own assignment.~~ Resolved in FE8: `GET /dashboard/me`.

---

## Frontend Phase 7 — Maintenance + fuel

**Status:** Done (`e2f2bfa`)

**Goal:** record and review running costs per vehicle. Built on backend Phase 7.

**Scope**

- Maintenance records and fuel logs, nested under a vehicle (list, create, edit, delete).
- Vehicle-specific history views with filters (e.g. date range, type), as supported by the API.
- Per-vehicle cost summary (totals by month) from the backend's summary endpoint. A chart only if it is clearer than a table.
- "Service due soon" indicators based on the backend's scheduled-job flag.
- Forms with validation and API error mapping; empty, loading and error states.

**Out of scope**

- Receipt or invoice uploads; email or push notifications (not in the backend).

**Built**

- Routes under `src/app/(app)/vehicles/[id]/`: `maintenance/` and `fuel/` (list with filters and pagination, `new`, `[recordId]/edit`, a segment `not-found.tsx`) and `costs/` (monthly cost summary with a month-range form). Each has route-private `_lib/` (Zod schema and edit diff, list params, API wrappers), `_components/` and `actions.ts` (create, update, delete).
- Vehicles: a `serviceStatus` filter and a Service column on the list; "Next service" and "Service status" rows on the detail page for all roles; `VehicleSectionNav` (Overview · Maintenance · Fuel · Costs) for ADMIN and MANAGER; `loadVehicle` and `canManageVehicleRecords`.
- Shared: `lib/date-only.ts` (`isDateOnly` moved from `license-status.ts`, plus `utcDateFromToday`, `isMonth`), `lib/decimal.ts` (`canonicalDecimal`), `formatDecimal`, `formatMonth`, `formatKm`, `lib/service-status.ts`, `ServiceStatusBadge`, `parseDateRange`, shadcn `textarea`, and the `maintenance-*` and `fuel-log-*` flash keys.
- Tests: unit and component tests for all of the above; Playwright `e2e/maintenance.spec.ts`, `e2e/fuel.spec.ts` and `e2e/cost-summary.spec.ts`, with `e2e/support/dates.ts` and `url.ts`. `cleanupE2eFixtures` now deletes the records and logs of E2E vehicles through the API. The API's `e2e-cleanup.ts` needed no change.
- No new npm dependency and no API change.

**Decisions**

- Q1: the screens are sub-pages of the vehicle (`/vehicles/[id]/{maintenance,fuel,costs}`) with a section nav, not sections on the detail page. There is no top-level nav item.
- Q2: no record detail pages. Each row has Edit (a separate page) and Delete (with confirmation).
- Q3: no chart. The cost summary is a table with a totals row; the chart library is chosen in FE8.
- Q4: amounts are shown with 2 decimals and no currency symbol, because the API does not expose the organization's currency.
- Q5: service status is the API's `serviceStatus`, shown as is (badge, list column and filter) to every role. The frontend never recomputes it, unlike `licenseStatus`.
- Q6: no client check for "next service due must be after the performed date". The API's 400 message is shown as a form-level error. Likewise `from <= to` and the 24-month cost range are left to the API.
- Q7: after a delete, the user goes back to the unfiltered list with a flash notice.
- Q8: filters are type, from and to for maintenance; from and to for fuel; a month range for costs (the API's default is the last 12 months). No presets.
- Q9: no overdue or due-soon widget; fleet-wide views are FE8.
- Money and liters are handled as strings, never floats. The edit diff compares canonical decimals (`89.9` equals `89.90`); create sends the typed value.
- Every sub-page checks the role before any fetch, so a DRIVER makes no maintenance, fuel or cost request.
- Mutations revalidate `/vehicles` as a layout, because maintenance writes change the vehicle's service fields.

**Deferred**

- ~~A cost chart~~ (done in FE8), currency display, sort controls on record lists, a combined "overdue or due soon" filter, price per liter, driver self-service fuel entry.
- A 401 inside a Server Action still loses unsaved form input (as in earlier phases).

**Backend gaps recorded**

1. No organization currency.
2. The `serviceStatus` filter takes a single value.
3. Service status can be up to one day stale between runs of the daily job.
4. No sort on maintenance and fuel lists.

---

## Frontend Phase 8 — Dashboard + reporting

**Status:** Done (`04c0178` API, `c02f2ff` web)

**Goal:** a fleet overview that answers the questions fleet managers ask most often.

**Scope**

- Fleet overview: number of vehicles, drivers, active assignments.
- Vehicle, maintenance, fuel and driver statistics, such as service due soon, licenses expiring soon, and cost this month vs last month.
- Cost summaries across the fleet.
- Charts only where they make a trend or comparison clearer than a number or a table. Every chart has a text or table equivalent.
- **Dependency:** the backend has no fleet-wide aggregate endpoints. FE8 must not compute statistics by loading every page of every list. The required endpoints are planned and approved as a backend change first (see "Dependency on Backend").

**Out of scope**

- Exportable reports, custom report builders and advanced analytics (product roadmap v1.3).

**Built**

- Dashboard `/` by role: ADMIN and MANAGER see the fleet overview (vehicles, drivers, active assignments, service and license counts linking to filtered lists, "as of" date) and fleet costs (this month and last month, a 12-month chart, a "Show data table" table, a link to `/costs`). A DRIVER sees their own overview: their vehicle and license, or a "not linked" or "no vehicle" state. Each section streams in its own `Suspense` boundary and fails on its own (`section-error`, `section-skeleton`, `stat-card`, `_lib/dashboard-api.ts`).
- Fleet cost report `/costs` (ADMIN, MANAGER) with a month range, chart and table, and a "Costs" nav item.
- `MonthlyCostChart`: a server-rendered SVG stacked bar chart (maintenance and fuel) with `role="img"`, a title, a description, per-month tooltips and a legend. Its geometry is in `lib/costs/chart-scale.ts`. The vehicle costs page now shows it too.
- Shared cost pieces moved to `components/costs/` (`CostSummaryTable`, `CostRangeForm` with a `path` prop) and `lib/costs/` (params, API wrappers including `getFleetCostSummary`).
- License status comes from the API: `LicenseStatusBadge` takes `status`, `lib/license-status.ts` holds labels only, and `/drivers` has a `licenseStatus` filter with its empty and error states.
- All seven GET filter forms are keyed on their query values, so "Clear filters" also resets the fields (a bug found by QA in FE8; present since FE4).
- Tests: unit and component tests for all of the above; Playwright `e2e/dashboard.spec.ts`, `e2e/costs.spec.ts`, and updates to the drivers, cost-summary and shell specs.
- No new npm dependency.

**Backend changes made for FE8** (see "Backend addendum — FE8 dashboard endpoints" in [`PHASES.md`](PHASES.md))

- `GET /dashboard/fleet` (ADMIN, MANAGER), `GET /dashboard/me` (any role, own data only), `GET /cost-summary` (fleet-wide, ADMIN, MANAGER).
- A computed `licenseStatus` on drivers and a `licenseStatus` filter on `GET /drivers`. The 30-day rule moved from the web app to the API.
- No migration and no new dependency.

**Decisions**

- Q1: the backend change was approved before frontend work started (Rule 9).
- Q2: a DRIVER can read their own driver record and current assignment through `/dashboard/me` only.
- Q3: license status moved into the API; the frontend never recomputes it, like `serviceStatus`.
- Q4: no chart library. A hand-written SVG Server Component adds no client JavaScript; Recharts 3.10.1 was considered and rejected for one chart type. Every chart has a table equivalent.
- Q5: a fleet cost report at `/costs` with a nav item for ADMIN and MANAGER.
- Q6: the per-vehicle costs page gets the chart too.
- Q7: this month and last month are shown side by side with no percentage, so the web app does no decimal arithmetic.
- Q8–Q10: currency, a multi-value `serviceStatus` filter and "highest-cost vehicles" stay deferred.
- Q11: ADMIN and MANAGER see the same dashboard.
- Q12: the backend change is recorded as an addendum in `PHASES.md`.
- `Number()` is used only for chart geometry; every amount shown is the API's string. The y-axis ticks are rounded compact labels.
- The chart scrolls horizontally on narrow screens (minimum width 34rem). Chart colours are 6.1:1 and 4.2:1 against the card.
- No new `revalidatePath`: the dashboard is dynamic and is rendered fresh on every request.

**Deferred**

- Organization currency, a multi-value `serviceStatus` filter, a month-over-month percentage, top-cost vehicles, CSV export.
- Indexes on `(organizationId, performedOn)` and `(organizationId, fueledOn)` for the fleet cost query.

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

## Frontend Phase 10 — Vehicle master data forms

**Status:** Planned. Starts after Backend [Phase 10](PHASES.md#phase-10--vehicle-master-data) part 3 (vehicle refactor) is done and approved.

**Goal:** vehicles are created, edited and filtered with dropdowns from the shared catalog instead of free-text make and model.

**Next.js concepts:** dependent form fields, loading options from a Route Handler or Server Action, resetting dependent state, Server Components for static option lists.

**Scope**

- **Dependent dropdowns** in the vehicle create and edit forms:
  - **Make** loads from `GET /master-data/vehicle-makes` (active only).
  - **Model** is disabled until a make is selected, then loads `GET /master-data/vehicle-makes/:makeId/models`. Changing the make clears the selected model and reloads the options.
  - **Vehicle type** loads from `GET /master-data/vehicle-types`, independent of make and model.
- **Editing a vehicle whose make, model or type is retired:** the current value is still shown and kept (`includeInactive=true` for the current value only), but cannot be newly selected.
- **Vehicle list filters** move from free-text make/model to the same dropdowns (ids).
- Vehicle tables, detail pages, assignments and the dashboard show the catalog names returned by the API.
- Loading, empty ("this make has no models") and error states for each dropdown. The API stays the source of truth for "model belongs to make" (rule 3); the UI only prevents the obvious mistake.

**Out of scope**

- Managing master data (create, edit, retire). Planned for the platform admin dashboard in [`product-roadmap.md`](product-roadmap.md).

---

## Dependency on Backend

Every frontend phase depends on the backend phases below. All backend phases must be done before FE1 starts (rule 1); this table shows which backend work each screen relies on, and which **gaps** exist today.

| Frontend phase            | Backend capabilities used                                                                                                                                           | Gaps to resolve first (backend changes, need approval)                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE1 Foundation            | Phase 1 `/api` prefix + `v1` versioning, `GET /api/v1/health`; Phase 8 OpenAPI document and unified error format; Phase 9 deployed API to point at.                 | None expected. CORS is not needed with the server-side API access design.                                                                                                                                                                                                       |
| FE2 Authentication        | Phase 3 `POST /auth/login`, `GET /auth/me`, bearer tokens, `401` behaviour; Phase 5 role in `/auth/me`, role re-read on every request; Phase 8 login rate limiting. | **No refresh tokens, logout or revocation** (Phase 3 out of scope). With a 900 s token, users are logged out every 15 minutes. Decide before FE2: accept this, raise `JWT_EXPIRES_IN` (max 86400), or add refresh tokens to the backend. **Decided: 15-minute token accepted.** |
| FE3 Shell                 | Phase 5 roles; `/auth/me` profile.                                                                                                                                  | ~~Organization name is not exposed.~~ **Resolved (FE3):** `/auth/me` now returns `organization: { id, name, slug }`.                                                                                                                                                            |
| FE4 Vehicles              | Phase 4 vehicles CRUD, pagination, filters, 404/409 behaviour; Phase 5 write roles (ADMIN, MANAGER).                                                                | None.                                                                                                                                                                                                                                                                           |
| FE5 Users + roles         | Phase 5 users CRUD, role filter, `PATCH /auth/me/password`, self-delete/self-demotion `409`.                                                                        | None.                                                                                                                                                                                                                                                                           |
| FE6 Drivers + assignments | Phase 6 drivers, assignments, current and past assignments, assignment rules.                                                                                       | Gaps: no assignment delete (test cleanup script), no driver search or filters, no license status from the API, no user summary on a driver, a MANAGER cannot list users, a DRIVER cannot see their own assignment.                                                              |
| FE7 Maintenance + fuel    | Phase 7 maintenance and fuel CRUD, per-vehicle cost summary, service-due flag.                                                                                      | None blocking. Gaps: no organization currency, single-value `serviceStatus` filter, no sort on record lists.                                                                                                                                                                    |
| FE8 Dashboard             | Phases 4–7 data.                                                                                                                                                    | ~~No fleet-wide aggregate endpoints.~~ **Resolved (FE8 addendum):** `/dashboard/fleet`, `/dashboard/me`, `/cost-summary`, driver `licenseStatus`.                                                                                                                               |
| FE9 Production            | Phase 8 error format, request IDs (shown in error messages to help support); Phase 9 Docker, CI and deployment.                                                     | The API must accept requests from the deployed frontend's server (network/host configuration, no CORS needed).                                                                                                                                                                  |
| FE10 Master data forms    | Phase 10 master data endpoints (makes, models per make, vehicle types) and the refactored vehicles API (`makeId`, `modelId`, `vehicleTypeId`).                      | All of Phase 10 part 3 (vehicle refactor).                                                                                                                                                                                                                                      |

---

## Development sequence

The full sequence across backend, frontend and product is at the end of [`product-roadmap.md`](product-roadmap.md#master-development-sequence). For the frontend: **backend Phase 9 done and approved → FE1 → FE2 → … → FE9 → FleetOps v1.0.** Phases are done in order, one at a time. The MongoDB + microservices learning track runs alongside; it is not a step in this sequence and is not required for v1.0.

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
