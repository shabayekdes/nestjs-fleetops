# MongoDB learning exercises

Exercises for the [MongoDB + Microservices Learning Track](../../docs/mongodb-microservices-track.md), Part A (Learning Stages 1–6).

**This folder is not part of FleetOps.** Nothing here is imported by `apps/api/` or `apps/web/`. The MongoDB below is used only for learning, and the root `docker-compose.yml` does not include it.

## Start MongoDB

Run from `learning/mongodb/`:

```bash
docker compose up -d --wait   # MongoDB 7.0 on 127.0.0.1:27017, no auth
docker compose exec mongo mongosh learning_l1   # interactive shell
docker compose down           # stop (data is kept in a volume)
docker compose down -v        # stop and delete the data
```

Set `MONGO_PORT` if 27017 is taken. MongoDB Compass can connect to `mongodb://127.0.0.1:27017`.

**Why MongoDB 7.0 and not 8.x:** MongoDB 8.0 and later refuse to start on Linux kernel 6.19+ because of a TCMalloc bug ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Everything in Part A works the same in 7.0. Move to 8.x once a fixed release is out.

## Run an exercise

Each exercise is a `mongosh` script. The folder is mounted read-only at `/learning` inside the container:

```bash
docker compose exec mongo mongosh --quiet learning_l1 /learning/l1-fundamentals/01-documents-and-bson.js
```

Every exercise recreates its own data first, so you can run them in any order and as often as you like.

Each exercise has three parts:

1. **Concepts**: a short explanation in the header comment.
2. **Worked examples**: numbered sections whose output is explained in comments. Read the code, run it, compare.
3. **Your turn**: tasks at the end. Try them in `mongosh` (or a scratch file) before opening `solutions/`.

## Stages

| Stage | Folder                                 | Status |
| ----- | -------------------------------------- | ------ |
| L1    | [`l1-fundamentals/`](l1-fundamentals/) | Done   |
| L2–L6 | Added when each stage is approved      | —      |

### L1 — MongoDB fundamentals

| File                                   | Topic                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `01-documents-and-bson.js`             | Documents, BSON types, ObjectId, type pitfalls           |
| `02-create-and-read.js`                | Implicit creation, inserts, duplicate `_id`, cursors     |
| `03-filter-sort-project.js`            | Operators, dot notation, arrays, missing fields, sorting |
| `04-update.js`                         | `$set`, `$inc`, array operators, `replaceOne`, upsert    |
| `05-delete.js`                         | Deletes, no foreign keys, soft delete                    |
| `06-embedding-and-references.js`       | Embedding vs referencing, joins in the application       |
| `07-pagination.js`                     | Offset vs range pagination, measured with `explain()`    |
| [`NOTES.md`](l1-fundamentals/NOTES.md) | Summary, SQL/Prisma comparison, pitfalls, your notes     |
