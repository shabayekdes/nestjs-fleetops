# Exercise — Vehicle types

The second guided exercise in the vehicle master data work ([Phase 10](../PHASES.md#phase-10--vehicle-master-data)). You add a **vehicle types** catalog (Van, Truck, Pickup, …) to the existing `MasterDataModule`, on your own this time, following the patterns from [`vehicle-master-data.md`](vehicle-master-data.md).

No skeleton is prepared. Writing the files yourself is the exercise. Ask for a review after each step.

## Scope

**In scope**

- `VehicleType` model, migration and seed data.
- `GET /api/v1/master-data/vehicle-types` (list) inside `src/master-data/vehicle-types/`, registered in `MasterDataModule`.
- Unit tests, e2e tests, README, `openapi.json` and the web's generated types.

**Not in scope** (these are the Phase 10 vehicle refactor, done afterwards):

- Making `vehicles.vehicle_type_id` required, and any change to the vehicles API. (The nullable column itself was added in Step 1, see decision 9.)
- Write endpoints. Master data stays read-only through the API (decision 10 in the first exercise).

## What to reuse

Everything below already exists. Reuse it instead of writing a second version.

| Need                                                  | Where it is                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| Module to register in                                 | `src/master-data/master-data.module.ts`                             |
| Query DTO rules (search, page/limit, includeInactive) | `src/master-data/vehicle-makes/dto/list-vehicle-makes-query.dto.ts` |
| Select / row type / mapper / `findAll` pattern        | `src/master-data/vehicle-makes/vehicle-makes.service.ts`            |
| LIKE escaping for search                              | `src/common/like.ts`                                                |
| Access rule (any authenticated role)                  | comment in `vehicle-makes.controller.ts`                            |
| Global-data e2e setup (suffix, own cleanup)           | `test/vehicle-master-data.e2e-spec.ts`                              |
| Idempotent catalog seed                               | the `vehicleCatalog` block in `prisma/seed.ts`                      |

## Decision log

Fill this in before writing code. One line of reasoning per row.

| #   | Decision                                                                         | Your choice                                                                                  | Why                                                                                                                                           |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Is a type independent of make and model, or does a model imply its type?         | Independent: the type belongs to the vehicle (`vehicles.vehicle_type_id`), no link to models | One model can be built as several body types (a Transit is a van, a minibus or a chassis cab).                                                |
| 2   | Uniqueness: `name`, `slug`, both? Case handling?                                 | `name` and `slug` both globally unique; slug stored lowercase                                | Flat list with no parent, same rules as makes; the lowercase slug catches case-only duplicates.                                               |
| 3   | Retire with `active` like makes/models, or something else?                       | Boolean `active` (default true)                                                              | Same as makes and models: rows are retired, never deleted, so vehicles keep their type.                                                       |
| 4   | Pagination: same `{ data, meta }` contract, or return the whole (small) list?    |                                                                                              |                                                                                                                                               |
| 5   | Search: needed at all for a list of ~10 rows?                                    |                                                                                              |                                                                                                                                               |
| 6   | Ordering: alphabetical, or a curated `sortOrder` column (e.g. Car before Truck)? | Alphabetical by name; no `sortOrder` column                                                  | A short list reads fine alphabetically; a curated order is a column to add only if users ask.                                                 |
| 7   | `GET /vehicle-types/:slug` too, like makes? Only if a client needs it.           |                                                                                              |                                                                                                                                               |
| 8   | Response fields                                                                  |                                                                                              |                                                                                                                                               |
| 9   | Add `vehicles.vehicle_type_id` now or in Part 3?                                 | Now, nullable, with a Restrict FK (expand step)                                              | Same expand step as `make_id`/`model_id`; Part 3 makes it required and adds the `(organizationId, vehicleTypeId)` index with the type filter. |

Hints:

- **Decision 1** decides whether `vehicle_types` is linked to `vehicle_models` at all. "Transit" is a van, but the same model can be a pickup or a chassis cab. If the type belongs to the vehicle, no link is needed now.
- **Decisions 4–6:** consistency with makes is a good default, but a 10-row list in a dropdown may not need search or pages. If you drop something, write why, and make sure unknown query parameters still return 400.

## Order of work

All commands run from `apps/api/`.

### Step 1 — Schema and migration

Add `VehicleType` to `prisma/schema.prisma` (UUIDv7, snake_case, `timestamptz(3)`, `@@map("vehicle_types")`), then:

```sh
npx prisma migrate dev --name add_vehicle_types
npm run db:test:migrate
```

**Verify:** the generated SQL has one `CREATE TABLE` and the indexes you expect, and no change to other tables.

### Step 2 — Seed

Add a small catalog (for example Car, Van, Pickup, Truck, Bus, SUV) next to `vehicleCatalog`, upserted on its unique key.

**Verify:** run `npm run db:seed` twice. The count stays the same.

### Step 3 — DTOs and their unit tests

Query DTO (decisions 4–5) and response DTO (decision 8), with a `.dto.spec.ts` covering defaults, every rejected value, and an unknown parameter.

**Verify:** `npm test -- vehicle-types`

### Step 4 — Service, controller and unit tests

Register the controller and service in `MasterDataModule`. JSDoc on the controller method for Swagger.

**Verify:**

- `npm test`
- Call the endpoint with `curl` as the seeded DRIVER (any role must get 200) and without a token (401).
- `/api/docs` shows the new `vehicle-types` tag.

### Step 5 — e2e tests

Create your own types with a random suffix; never rely on seeded rows. Cover 401, ordering, retired rows, invalid and unknown query parameters, the exact response keys, and the uniqueness constraints.

**Verify:** `npm run test:e2e`

### Step 6 — Contracts and docs

```sh
npm run openapi:export                       # from apps/api/
npm run api:types                            # from apps/web/
```

Add the endpoint to `apps/api/README.md`. Then run the full Definition of Done: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`.

## When you want a review

Ask step by step ("review Step 1 of vehicle types"). The review compares the code with your decision log and with the makes/models implementation.
