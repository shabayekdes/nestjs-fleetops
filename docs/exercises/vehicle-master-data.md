# Exercise — Vehicle master data

**Status:** Done (`964d26c`). Every `TODO(LEARN)` is solved; the sections below describe the exercise as it was set. It is the first part of [Phase 10 — Vehicle master data](../PHASES.md#phase-10--vehicle-master-data). The next exercise is [`vehicle-types.md`](vehicle-types.md).

A guided coding exercise. The skeleton is in place; you write the logic. Every place to write code is marked `TODO(LEARN)`:

```sh
grep -rn --exclude-dir=generated "TODO(LEARN)" apps/api/src apps/api/prisma apps/api/test
```

Progress, decisions and deferred items are recorded in the Phase 10 entry of [`docs/PHASES.md`](../PHASES.md).

## What already exists

| Path (under `apps/api/`)                            | State                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                              | `VehicleMake` and `VehicleModel` with id, name, slug, timestamps and the FK. Active state, uniqueness and indexes are TODOs. **No migration yet.** |
| `src/master-data/master-data.module.ts`             | `MasterDataModule`: one module for all global reference data, registering both controllers and services.                                           |
| `src/master-data/vehicle-makes/`                    | Controller (`GET /api/v1/master-data/vehicle-makes`), service stub (501), query DTO (empty), response DTO (partial).                               |
| `src/master-data/vehicle-models/`                   | Controller (`GET /api/v1/master-data/vehicle-makes/:makeId/models`), service stub (501), query DTO (empty), response DTO (partial).                |
| `src/app.module.ts`                                 | `MasterDataModule` registered.                                                                                                                     |
| `prisma/seed.ts`                                    | `vehicleCatalog` data; the upsert logic is a TODO.                                                                                                 |
| `*.spec.ts`, `test/vehicle-master-data.e2e-spec.ts` | Test names as `it.todo`, with Arrange / Act / Assert notes.                                                                                        |

Until you implement them, both endpoints return **501 Not Implemented** with the standard error body.

## Decision log

Fill this in as you go. Every row should have a one-line reason. The reviewer will read this first.

| #   | Decision                                                                      | Your choice                                                              | Why                                                                                                                                 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How is a make/model retired (boolean, enum, timestamp)?                       | Boolean `active` (default true) on makes and models                      | Only two states; nothing needs when a row was retired. Rows are retired, never deleted.                                             |
| 2   | Make: unique name? unique slug? case handling?                                | `name` and `slug` both globally unique; slug stored lowercase            | One shared catalog leaks nothing across tenants. The lowercase slug catches "BMW"/"bmw" without citext.                             |
| 3   | Model: unique globally or per make (name, slug)?                              | Unique per make: `(makeId, name)` and `(makeId, slug)`                   | The same model name exists under several makes (badge engineering). Leading `make_id` also indexes the FK.                          |
| 4   | Retired make: what happens to its models in the API?                          | Derived at query time: no models offered unless `includeInactive=true`   | Nothing to keep in sync; reactivating a make restores each model's own state.                                                       |
| 5   | `onDelete` for model → make                                                   | `Restrict` (also on `vehicles.make_id`/`model_id`)                       | Master data is retired, never deleted; vehicle history must keep its make and model.                                                |
| 6   | Pagination for master data lists?                                             | Yes: `page` (default 1), `limit` (default 20, max 100), `{ data, meta }` | Same contract as every FleetOps list.                                                                                               |
| 7   | Search: exact, prefix or contains? Blank search = 400 or ignored? Max length? | Case-insensitive `contains`, `%`/`_` escaped; blank = 400; max 100       | Useful for a dropdown ("benz"); blank is 400 like vehicles. Prisma does not escape LIKE wildcards (`src/common/like.ts`).           |
| 8   | `includeInactive` parameter?                                                  | Yes, `includeInactive=true                                               | false`                                                                                                                              | A vehicle form must still show a retired make or model a vehicle already uses. |
| 9   | Who can read (public, any role, ADMIN/MANAGER)?                               | Any authenticated user (JWT required, no `@Roles()`)                     | No client needs it before login; every role that sees vehicles may see their makes, and ADMIN/MANAGER need it for the vehicle form. |
| 10  | Who can write master data (nobody via API, a new platform role, …)?           | Nobody via the API; seed/migrations only                                 | ADMIN is per organization but the catalog is shared by all of them. Revisit with a platform-level role.                             |
| 11  | Response fields for make and model                                            | `id`, `name`, `slug`, `active` for both                                  | A pick list needs no timestamps; `active` is needed because retired rows can be returned.                                           |

## Order of work

Do the steps in order. Each one ends with a check you can run before moving on. All commands run from `apps/api/`.

### Step 1 — Schema and migration

1. Resolve the `TODO(LEARN)` blocks in `prisma/schema.prisma` (decisions 1–5). Leave the `Vehicle` TODO alone.
2. `npx prisma validate`
3. `npx prisma migrate dev --name add_vehicle_master_data`, then open the generated `migration.sql` and read it. Check: two `CREATE TABLE`s, the FK with `ON DELETE RESTRICT`, one index per unique, and no change to `vehicles`.
4. `npm run prisma:generate` (migrate dev normally does this) and `npm run db:test:migrate`.

**Verify:** `npm run typecheck` passes; `\d vehicle_models` in psql shows the indexes you expected.

If you get a decision wrong after this step, fix it with a **new** migration. Never edit an applied one.

### Step 2 — Seed

Implement the TODO in `prisma/seed.ts`.

**Verify:** run `npm run db:seed` **twice**. The second run must succeed, and the row counts must not change:

```sql
SELECT (SELECT count(*) FROM vehicle_makes) AS makes, (SELECT count(*) FROM vehicle_models) AS models;
```

Expected for the current catalog: 5 makes, 14 models.

### Step 3 — DTOs and their unit tests

Implement both query DTOs (decisions 6–8), then replace the `it.todo`s in both `list-*-query.dto.spec.ts` files.

**Verify:** `npm test -- master-data` (unit tests only).

### Step 4 — Services, controllers and their unit tests

1. Response DTOs (decision 11), select constants and mappers.
2. `VehicleMakesService.findAll`, then `VehicleModelsService.findAllForMake`.
3. Controllers: `makeId` validation pipe, access decision (9), Swagger JSDoc.
4. Replace the `it.todo`s in both `*.service.spec.ts` files.

**Verify:**

- `npm test`
- `npm run start:dev`, log in as `alex@acme-logistics.test` (password in `prisma/seed.ts`), then call both endpoints with `curl` or the Swagger UI at `http://localhost:3000/api/docs`. Try a malformed `makeId`, an unknown UUIDv7 and a blank search.
- In `/api/docs`, check the two new tags, the query parameters and the response schemas.

### Step 5 — e2e tests

Replace the `it.todo`s in `test/vehicle-master-data.e2e-spec.ts`. Read the notes at the top of the file first: makes are global, so other rows will appear in your lists.

**Verify:** `npm run test:e2e`, then the full Definition of Done: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`. Update `apps/api/README.md` with the two endpoints.

Commit here. Step 6 is a separate change.

### Step 6 — Vehicle integration (make/model strings → `makeId`/`modelId`)

Do **not** start this until Steps 1–5 are merged. Treat it as its own small phase: write your answers to the questions below in this file first, then implement.

#### What uses `make` and `model` today

Check this list yourself (`grep -rn "make" apps/api/src apps/web/src`). It is a starting point, not a complete list.

- `vehicles` table: `make TEXT NOT NULL`, `model TEXT NOT NULL`, free text, as typed by users.
- `src/vehicles/`: create/update DTOs (trim, max 50), `GET /vehicles?make=&model=` (case-insensitive exact match), the 10-key response.
- Embedded vehicle summaries: `src/assignments/` (assignment responses) and `src/dashboard/` (`/dashboard/me`).
- `prisma/seed.ts`: three vehicles with string make/model.
- `prisma/e2e-cleanup.ts` and the web Playwright helpers (`apps/web/e2e/support/api.ts`) find test vehicles by `make` starting with `E2E-`. If `make` disappears, that cleanup silently stops matching.
- The web app: vehicle form (free-text inputs), filters, tables, detail pages.

#### Questions to answer before writing code

1. **Database changes.** Which columns, FKs (`onDelete`?) and indexes are added to `vehicles`? Is `modelId` alone enough, since a model already knows its make? What does storing both `makeId` and `modelId` cost, and what can go wrong (a vehicle whose `modelId` belongs to a different make than its `makeId`)? How would you prevent that: in the service, or in the database (composite FK on `(make_id, model_id)` referencing a unique `(make_id, id)` on `vehicle_models`)?
2. **Migration risks.** Existing rows hold free text: `"ford"`, `"Ford "`, `"F0rd"`, `"Mercedes Benz"`, models that are not in the catalog, and test-data makes like `E2E-…`. What happens to rows that do not match? Can you add `NOT NULL` in the same migration? How long is the `vehicles` table locked while you backfill on a large table?
3. **Backfilling existing vehicles.** Matching rules (case-insensitive? trimmed?), what happens to unmatched rows (create the missing make/model? leave the FK `NULL` and report?), and how you will check the result (a query that counts unmatched rows before and after).
4. **Coexistence.** Do `make`/`model` strings stay next to the FKs for a while (expand → migrate → contract), or are they replaced in one migration? Which is safer when the API and the web app are deployed separately? What keeps the string and the FK in sync while both exist?
5. **API contract.** Does `POST /vehicles` take `makeId`/`modelId`, names, or both during a transition? Does the response keep `make: string` (now read from the join) or become `make: { id, name }`? Every key change breaks the web app and the exact-key e2e assertions. How do you roll it out without a broken deploy in between?
6. **Filters.** Does `GET /vehicles?make=Ford` become `?makeId=`? Keep both for a while? Does a retired make still filter?
7. **Seed.** Seeded vehicles must reference catalog rows, so the catalog must be seeded first. Ford Transit, Mercedes-Benz Sprinter and Volvo FH16 are already in `vehicleCatalog` for this reason.
8. **Business rules.** Can a NEW vehicle use a retired make or model (decision 1)? Can an EXISTING vehicle keep one? Changing a vehicle's make: must the model change with it?

#### Where the data migration goes

1. `npx prisma migrate dev --create-only --name add_vehicle_make_model_refs`. `--create-only` writes the SQL without applying it, so you can edit it before it runs.
2. In the generated `migration.sql`, Prisma writes only the DDL (new columns, FKs, indexes). **Your data migration goes between the `ALTER TABLE ... ADD COLUMN` statements and any `SET NOT NULL`**: the `UPDATE vehicles SET make_id = ... FROM vehicle_makes ...` backfill, which you write.
3. Apply it with `npx prisma migrate dev`, then `npm run db:test:migrate`.
4. A later, separate migration drops the old string columns (the "contract" step), only after nothing reads them.

Do not run `prisma migrate reset` on the dev database to "start clean" (CLAUDE.md); a migration that only works on an empty database is not finished.

## When you want a review

Ask for a review step by step (for example "review Step 1"). The review covers correctness, NestJS and Prisma conventions, database design, validation, security, performance, test quality and maintainability, and compares the code with your decision log.
