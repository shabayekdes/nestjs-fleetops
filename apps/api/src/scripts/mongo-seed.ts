/**
 * Development seed for telemetry (MongoDB). Run through `npm run mongo:seed`.
 * Needs `npm run db:seed` (reads the Acme Logistics vehicles from PostgreSQL,
 * read-only) and `npm run mongo:setup` (collections and indexes).
 *
 * DEVELOPMENT ONLY and SYNTHETIC. Idempotent: it deletes only the readings and
 * the latest status of the seeded vehicles of that organization, then inserts
 * again. Never drops collections, never touches other organizations or
 * vehicles. Never prints the connection string.
 */
import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { MongoClient } from 'mongodb';
import { validateEnv } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { toLatestDocument } from '../telemetry/telemetry.mappers.js';
import {
  buildMongoClientOptions,
  isTelemetryEnabled,
} from '../telemetry/telemetry-config.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from '../telemetry/mongo/telemetry-documents.js';
import {
  TELEMETRY_READINGS,
  VEHICLE_LATEST_STATUS,
  verifyTelemetrySchema,
} from '../telemetry/mongo/telemetry-schema.js';
import { generateTelemetrySeed } from './telemetry-seed-data.js';

const ORG_SLUG = 'acme-logistics';
const DEFAULT_DAYS = 7;
const SEED = 20_260_101;
const CHUNK = 1000;

class SeedError extends Error {}

function parseDays(args: string[], maxDays: number): number {
  const arg = args.find((a) => a.startsWith('--days='));
  const unknown = args.filter((a) => a !== arg);
  if (unknown.length > 0) {
    throw new SeedError(`Unknown argument: ${unknown.join(' ')}`);
  }
  const days = arg ? Number(arg.slice('--days='.length)) : DEFAULT_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > maxDays) {
    throw new SeedError(`--days must be an integer from 1 to ${maxDays}.`);
  }
  return days;
}

async function loadVehicles(): Promise<{
  organizationId: string;
  ids: string[];
}> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new SeedError('DATABASE_URL is not set.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: ORG_SLUG },
      select: { id: true },
    });
    const vehicles = org
      ? await prisma.vehicle.findMany({
          where: { organizationId: org.id },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    if (!org || vehicles.length === 0) {
      throw new SeedError(
        `Organization "${ORG_SLUG}" or its vehicles not found. Run \`npm run db:seed\` first.`,
      );
    }
    return {
      organizationId: org.id,
      ids: vehicles.map((v) => v.id.toLowerCase()),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production' || nodeEnv === 'test') {
    throw new SeedError(
      `Refusing to run the telemetry dev seed with NODE_ENV=${nodeEnv}.`,
    );
  }
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const env = validateEnv(process.env);

  if (!isTelemetryEnabled(process.env)) {
    throw new SeedError('MONGODB_URI is not set: telemetry is disabled.');
  }
  const { MONGODB_URI: uri, MONGODB_DB: dbName } = env;
  if (!uri || !dbName) {
    throw new SeedError('MONGODB_URI and MONGODB_DB are required.');
  }

  // Stay below retention so the TTL does not delete the data right away.
  const maxDays = Math.max(1, env.TELEMETRY_RAW_RETENTION_DAYS - 1);
  const days = parseDays(process.argv.slice(2), maxDays);

  const { organizationId, ids } = await loadVehicles();

  const client = new MongoClient(uri, buildMongoClientOptions(env));
  try {
    await client.connect();
    const db = client.db(dbName);
    const problems = await verifyTelemetrySchema(db);
    if (problems.length > 0) {
      throw new SeedError(
        `Telemetry schema is not ready (database ${dbName}):\n  ${problems.join('\n  ')}\nRun \`npm run mongo:setup\` first.`,
      );
    }

    const now = new Date();
    const readings = generateTelemetrySeed(
      ids.map((vehicleId) => ({ organizationId, vehicleId })),
      { now, days, seed: SEED },
    );

    const readingsCol =
      db.collection<TelemetryReadingDocument>(TELEMETRY_READINGS);
    const latestCol = db.collection<VehicleLatestStatusDocument>(
      VEHICLE_LATEST_STATUS,
    );

    const deletedReadings = await readingsCol.deleteMany({
      'meta.organizationId': organizationId,
      'meta.vehicleId': { $in: ids },
    });
    const deletedLatest = await latestCol.deleteMany({
      organizationId,
      vehicleId: { $in: ids },
    });

    for (let i = 0; i < readings.length; i += CHUNK) {
      await readingsCol.insertMany(readings.slice(i, i + CHUNK), {
        ordered: false,
      });
    }

    // Latest status: the newest reading of each vehicle.
    const newest = new Map<string, TelemetryReadingDocument>();
    for (const reading of readings) {
      const current = newest.get(reading.meta.vehicleId);
      if (!current || reading.timestamp > current.timestamp) {
        newest.set(reading.meta.vehicleId, reading);
      }
    }
    for (const [vehicleId, reading] of newest) {
      await latestCol.replaceOne(
        { organizationId, vehicleId },
        toLatestDocument(reading, new Date()),
        { upsert: true },
      );
    }

    console.log(`Telemetry dev seed done (database ${dbName})`);
    console.log(
      `  removed previous seed data: ${deletedReadings.deletedCount} readings, ${deletedLatest.deletedCount} latest statuses`,
    );
    for (const id of ids) {
      const own = readings.filter((r) => r.meta.vehicleId === id);
      console.log(`  vehicle ${id}: ${own.length} readings`);
    }
    const first = readings.reduce(
      (a, r) => (r.timestamp < a ? r.timestamp : a),
      now,
    );
    const last = readings.reduce(
      (a, r) => (r.timestamp > a ? r.timestamp : a),
      first,
    );
    console.log(
      `  total ${readings.length} readings from ${first.toISOString()} to ${last.toISOString()} (${days} days)`,
    );
    console.log('Try (as a logged-in user of Acme Logistics):');
    console.log('  GET /api/v1/telemetry/latest');
    console.log(
      '  GET /api/v1/telemetry/latest/near?latitude=30.05&longitude=31.24&radiusMeters=20000',
    );
    console.log(
      `  GET /api/v1/telemetry/vehicles/${ids[0]}/daily?from=<date>&to=<date>&timezone=Africa/Cairo`,
    );
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
