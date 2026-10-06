# FleetOps Web — Conventions

Conventions for `apps/web/` (Next.js). The root `CLAUDE.md` covers the organization and the API (`apps/api/`); this file covers the web app only.

## 1. Scope and sources

- Rules 1–9 in `docs/frontend-roadmap.md` apply to every change. Build only the current Frontend Phase.
- The API is the source of truth for data, validation, security and permissions. The web app shows the API's answer; it never duplicates business or authorization rules. Hiding a button is for usability only.
- If a screen needs something the API does not provide, report an API gap. Do not work around it.

## 2. Stack and pinned versions

Next.js 16.3.8 (App Router), React 19.2.8, TypeScript 5.9.3 (strict), Tailwind CSS 4.3.3, Zod 4.6.5, Vitest 5.0.3 + React Testing Library, Playwright 1.63.0 (e2e), ESLint 9.39.5 + Prettier 3.9.9, openapi-typescript 7.13.0, radix-ui 1.7.0, class-variance-authority 0.7.1, cn 0.4.0, lucide-react 1.52.0, tw-animate-css 1.4.0 (shadcn/ui support). Node 24 (root `.nvmrc`). All versions are exact (`.npmrc` has `save-exact=true`).

Deliberate holds:

- React 19.2.8, not 19.3: create-next-app 16.3.8 pins it.
- TypeScript 5.9.3: openapi-typescript 7.13 has a `^5` peer. The API uses TypeScript 6, which is fine.
- ESLint 9.39.5, not 10: the plugins in eslint-config-next 16.3.8 allow at most 9. A deprecation notice is accepted.
- `@types/node` 24 matches the Node 24 runtime.
- `npm audit` reports high findings from a single `braces` advisory (no patched release) in the dev-only lint chain under eslint-config-next. `npm audit --omit=dev` is clean. These are accepted; never run `npm audit fix --force` (it downgrades eslint-config-next to 14). Re-check when eslint-config-next updates.

Next.js 16 has APIs newer than most training data. Read `node_modules/next/dist/docs` before using a Next API (`error.tsx` `retry`, `connection()`, `next typegen`, instrumentation).

## 3. Folder structure and naming

- `src/app/` routes; `src/lib/` shared non-UI code (`lib/env`, `lib/api`, `lib/auth`); `src/components/` UI shared by several routes.
- Route groups: `(public)` (no session needed, e.g. `login`) and `(app)` (protected, its layout loads the current user). `session-expired` is a public Route Handler; `dev/` is public.
- `src/proxy.ts` is the Next.js 16 proxy (formerly middleware). `e2e/` holds Playwright tests.
- Files are kebab-case, components PascalCase. Tests sit next to the code (`*.test.ts(x)`).
- Colocate components used by one route inside that route folder. The application shell is in `src/app/(app)/_shell/` (nav items, sidebar, mobile drawer, header, user menu).
- `src/components/ui/` is copied shadcn/ui code that we own (add with `npx shadcn@4.21.3 add <name>`; never add the CLI as a dependency). Edit it only minimally, keep it lint-clean, and do not unit-test it directly.
- Import with the `@/` alias for `src/`.
- Relative imports have no `.js` extension (bundler resolution). This is deliberately the opposite of the API rule.
- No barrel files that mix server-only and client code.

## 4. Server vs Client Components

- Server Components by default. Add `'use client'` only for interactivity and for error boundaries (`error.tsx`, `global-error.tsx`).
- Every module that touches env or the API starts with `import 'server-only'`.
- Never render `error.message` in an error boundary; show a generic message and the `digest`.

## 5. Calling the API

- Only through `apiRequest` in `@/lib/api/client`, from server code (Server Components, Server Actions, Route Handlers). Never `fetch` the API anywhere else. The browser never calls the API.
- Types come from `@/lib/api/types` (generated from OpenAPI). Callers pass the response type: `apiRequest<HealthResponse>('/health')`.
- Failures are `ApiError` (HTTP error: `status`, `message`, `fieldErrors`, `requestId`) or `ApiConnectionError` (`reason: 'timeout' | 'unreachable'`).

| Result                       | UI                                                   |
| ---------------------------- | ---------------------------------------------------- |
| 400 with `fieldErrors`       | Show messages next to the matching fields            |
| 401                          | Handled centrally by `sessionApiRequest`             |
| 403                          | `NotAllowed` / `NOT_ALLOWED_MESSAGE`; do not log out |
| 404                          | `notFound()`                                         |
| 409                          | Form-level message using the API message             |
| 5xx and `ApiConnectionError` | Generic "service unavailable"; never raw details     |

Authenticated calls:

- Use `sessionApiRequest` from `@/lib/auth/session-api`. In Server Components and layouts use the default `mode: 'render'`; in Server Actions and Route Handlers pass `mode: 'action'`.
- Never call `apiRequest` with an `accessToken` directly, except the login action and the `/session-expired` route handler.
- `sessionApiRequest` redirects (a thrown error) on a missing session or a 401. Code that wraps it in `try/catch` must catch only `ApiError`/`ApiConnectionError`, or call `unstable_rethrow(error)` first, so the redirect is not swallowed.
- 403: pages catching `ApiError` with status 403 render `<NotAllowed />` (`@/components/not-allowed`); Server Actions return `{ formError: NOT_ALLOWED_MESSAGE }`. Never delete the session on 403. Do not use `forbidden()`/`unauthorized()` (experimental).

## Authentication

- The session is the encrypted cookie `fleetops_session` (`httpOnly`, `SameSite=Lax`, `Secure` in production), AES-256-GCM via `node:crypto` (`lib/auth/session-crypto.ts`, key derived from `SESSION_SECRET`). It holds only `{ accessToken, expiresAt }`. No auth library.
- Treat a session as expired 30 s early (`SESSION_EXPIRY_SKEW_MS`). The access token lives 15 minutes; there is no refresh.
- `src/proxy.ts` is an optimistic gate: it reads the cookie and never calls the API. It also sets the `x-fleetops-pathname` request header (always overwritten) for `returnTo`. Real authorization is the API's.
- The role comes only from `getCurrentUser()` (`GET /auth/me`). Never store it in the cookie or parse the JWT.
- Never pass the token, or anything derived from it, to Client Components, URLs or logs. `SessionExpiryNotice` receives only the remaining milliseconds.
- Every redirect target from user input goes through `safeReturnTo`.
- Server Actions that sign in or out call `redirect()` outside `try/catch`.

## 6. Environment variables

- Validated with Zod in `src/lib/env/server.ts`; the server exits at startup if invalid (`src/instrumentation.ts`).
- Add every new variable to the schema, `.env.example` and the README.
- `SESSION_SECRET` (min 32 characters) encrypts the session cookie; changing it signs everyone out.
- Never put a secret in a `NEXT_PUBLIC_` variable.

## 7. OpenAPI workflow

API change, then `npm run openapi:export` (in `apps/api`), then `npm run api:types` (in `apps/web`), then commit both. `src/lib/api/generated/` is generated: never edit it. CI fails on drift.

## 8. Styling

Tailwind utility classes plus shadcn/ui on Radix (`src/components/ui/`). Shared building blocks in `src/components/`: `PageHeader`, `EmptyState`, `ErrorState`, `Notice` (inline, no toast library), `PageSkeleton`, `ConfirmDialog`, `NotAllowed`. Prefer theme tokens (`bg-background`, `text-muted-foreground`, `border`) over fixed colors. There is no dark mode: `globals.css` keeps the `dark` custom variant on `.dark` only, so `dark:` classes never apply. Only `ShellUser` (name, email, role, organization name) crosses into shell Client Components.

## 9. Accessibility

Labels on every input, semantic landmarks and headings, keyboard-usable controls, visible focus, `role="status"` for loading states.

## 10. Testing

- Vitest + React Testing Library. No real network: mock with `vi.spyOn(globalThis, 'fetch')`; set env with `vi.stubEnv`.
- Component tests start with `// @vitest-environment jsdom`. `server-only` is mocked in `vitest.setup.ts`, which also stubs `ResizeObserver`, `scrollIntoView` and pointer-capture methods for jsdom (Radix needs them). With Radix, open menus with `fireEvent.keyDown(trigger, { key: 'Enter' })` and sheets or dialogs with `fireEvent.click`; `userEvent` pointer events are unreliable in jsdom.
- Playwright e2e lives in `e2e/` (`npm run test:e2e`, Chromium, one worker). It starts the API (port 3100, `NODE_ENV=test`) and the web app (port 3101) itself and needs a migrated, seeded test database; see the README. `e2e/support/session.ts` imports only `lib/auth/session-crypto.ts` (which must stay free of `server-only`) to forge cookies. Vitest only includes `src/**`.

## 11. Definition of Done

`npm run format:check`, `lint` (0 warnings), `typecheck`, `test`, `build` and `test:e2e` pass; `npm run api:types` produces no diff; the README is updated when commands, env vars or routes change; `docs/frontend-roadmap.md` is updated at the end of a phase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
