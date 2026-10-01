# Esmail Software Engineering Organization

## Engineering Organization

CTO
├── Backend Lead
│   └── NestJS Developer
│
├── Frontend Lead
│   └── Next.js Developer
│
└── QA Lead
    └── QA Developer

Agents live in `.claude/agents/`: `cto-esmail`, `backend-lead`, `nestjs-developer`, `qa-lead`, `qa-developer`, `frontend-lead`, `nextjs-developer` (frontend agents are inactive — this repo has no frontend yet).

### How orchestration works

Subagents cannot launch other subagents. The **main conversation is the orchestrator**:

1. Large or cross-cutting work → ask `cto-esmail` for a plan. Each task in the plan names an agent.
2. The main conversation launches the named agents in order, passing each one the plan and the previous agent's output (e.g. `backend-lead` plan → `nestjs-developer`; `qa-lead` plan → `qa-developer`).
3. Independent tasks may run in parallel.
4. When implementation is done, send the results back to `cto-esmail` for the final review.

Small, well-understood changes can go straight to `nestjs-developer` or `qa-developer`.

Leads and the CTO are read-only planners/reviewers; only developers edit files.

---

## Project Conventions (FleetOps API)

Stack: NestJS 12 · TypeScript strict · native ES modules · PostgreSQL · Prisma 7 · Jest · ESLint + Prettier.

### Code

- ESM with NodeNext resolution: relative imports **must** end in `.js` (`./health.service.js`).
- No `any` (ESLint enforces it).
- Routes are under `/api` with URI versioning (default `v1`), configured in `src/app.setup.ts`. Do not hardcode `v1` in controllers.
- `src/app.setup.ts` is shared by `main.ts` and e2e tests; put global HTTP config there.
- The global `ValidationPipe` uses whitelist + forbidNonWhitelisted + transform. Use DTOs with class-validator for all input.
- Config comes from `ConfigService<EnvironmentVariables, true>`. Add new env vars to `src/config/env.validation.ts`, `.env.example` and `.env.test.example`.

### Database

- Use `PrismaService` (`src/database/`) directly in services. No repositories, base services or generic CRUD.
- Feature modules import `DatabaseModule` explicitly. It is not global.
- The generated client is in `src/generated/prisma` (git-ignored). Import from `../generated/prisma/client.js`. Run `npm run prisma:generate` after schema changes.
- Tenant-owned tables (`users`, `vehicles`, …) carry `organizationId`. Uniqueness is tenant-scoped (`@@unique([organizationId, …])`), and every query on tenant data filters by `organizationId`.
- Foreign keys use `onDelete: Restrict` unless there is an explicit reason otherwise.
- Primary keys are UUIDv7: `@id @default(uuid(7)) @db.Uuid`. Tables and columns are snake_case via `@@map`/`@map`. Timestamps are `@db.Timestamptz(3)`.
- Never return `passwordHash`. Use an explicit `select` or response DTOs.
- Change the schema only with `npx prisma migrate dev --name <name>`. Never edit an applied migration.
- Never run `prisma migrate reset` or other data-destroying commands without the user's explicit approval.
- Prisma 7 quirks:
  - `$connect()` does not open a connection.
  - `instanceof PrismaService` is always false.

### Testing

- `npm test`: unit tests in `src/**/*.spec.ts`. No database; mock dependencies with `useValue`.
- `npm run test:e2e`: e2e and integration tests in `test/*.e2e-spec.ts`. Uses the real database from `.env.test`, and only that file, because `NODE_ENV=test` loads `.env.test` exclusively.
- Run `npm run db:test:migrate` after adding migrations.
- Jest runs in native ESM mode. Get the mock API from `import { jest } from '@jest/globals';`.
- e2e tests must call `configureApp(app)`.
- Integration tests create uniquely named data and delete only what they created. Never truncate shared tables.

### Definition of Done

`npm run lint`, `npm test`, `npm run test:e2e` and `npm run build` all pass, and the README is updated when commands, endpoints or env vars change.

---

## Engineering Principles

- Understand existing code before modifying it.
- Do not rewrite working code without a clear reason.
- Prefer simple solutions over unnecessary complexity.
- Follow existing project conventions.
- Keep responsibilities separated.
- Write testable code.
- Never introduce dependencies without justification.
- Never expose secrets or credentials.
- Never modify database structure without a migration.
- Document important architectural decisions.

---

## Development Workflow

Every feature should follow:

1. Understand the requirement.
2. Inspect the existing codebase.
3. Identify affected modules.
4. Create an implementation plan.
5. Implement the feature.
6. Run tests.
7. Review the implementation.
8. Report what changed.

---

## Git Rules

- Keep commits focused.
- Do not mix unrelated changes.
- Never remove existing functionality without explicit approval.
- Never commit secrets.