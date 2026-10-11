/**
 * Writes the OpenAPI document to disk (default: ./openapi.json).
 *
 * No database connection is opened: the application is created but never
 * initialised (no init()/listen()), and Prisma only connects on first query.
 * Placeholder env values satisfy config validation, which runs at import time.
 * MONGODB_URI is a placeholder too (never connected to), so telemetry paths
 * are always documented.
 *
 * Run through `npm run openapi:export`: only the Nest CLI build applies the
 * @nestjs/swagger plugin that derives schemas (and enums) from the DTOs.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:1/openapi';
// Telemetry routes must always be in the document, so the opt-in module is
// enabled with an unreachable URI (the app is never initialised: no I/O).
// `||=` also overrides an empty value, so the output is independent of the
// developer's MONGODB_URI.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:1';
process.env.MONGODB_DB ||= 'openapi_export';
process.env.JWT_SECRET ??= 'openapi-export-placeholder-secret-0123456789';

// Dynamic imports: static ones hoist above the env assignments above.
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../app.module.js');
const { configureApp } = await import('../app.setup.js');
const { createOpenApiDocument } = await import('../swagger.js');

const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
configureApp(app);

const document = createOpenApiDocument(app);
await app.close();

const target = resolve(process.argv[2] ?? 'openapi.json');
await writeFile(target, JSON.stringify(document, null, 2) + '\n');
console.log(`OpenAPI document written to ${target}`);
