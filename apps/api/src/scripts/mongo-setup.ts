/**
 * Creates or reconciles the telemetry collections and indexes (idempotent).
 * Run through `npm run mongo:setup` (dev) or `npm run mongo:test:setup` (test):
 * it needs the built output because env validation relies on decorator metadata.
 * Never drops anything.
 */
import 'reflect-metadata';
import { MongoClient } from 'mongodb';
import { validateEnv } from '../config/env.validation.js';
import {
  buildMongoClientOptions,
  isTelemetryEnabled,
} from '../telemetry/telemetry-config.js';
import { ensureTelemetrySchema } from '../telemetry/mongo/telemetry-schema.js';

const isTest = process.env.NODE_ENV === 'test';

try {
  process.loadEnvFile(isTest ? '.env.test' : '.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);

  if (!isTelemetryEnabled(process.env)) {
    console.error(
      'MONGODB_URI is not set: telemetry is disabled, nothing to do.',
    );
    process.exitCode = 1;
    return;
  }
  const { MONGODB_URI: uri, MONGODB_DB: dbName } = env;
  if (!uri || !dbName) {
    console.error('MONGODB_URI and MONGODB_DB are required.');
    process.exitCode = 1;
    return;
  }
  if (isTest && !dbName.endsWith('_test')) {
    console.error(
      `Refusing to run against "${dbName}": test databases must end with _test.`,
    );
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(uri, buildMongoClientOptions(env));
  try {
    await client.connect();
    const report = await ensureTelemetrySchema(client.db(dbName), {
      retentionDays: env.TELEMETRY_RAW_RETENTION_DAYS,
    });
    console.log(`MongoDB telemetry schema ready (database ${dbName})`);
    for (const [label, items] of Object.entries(report)) {
      for (const item of items) console.log(`  ${label}: ${item}`);
    }
  } finally {
    await client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
