import type { MongoClientOptions } from 'mongodb';
import type { EnvironmentVariables } from '../config/env.validation.js';

/** Telemetry is opt-in: enabled only when MONGODB_URI is set and non-blank. */
export function isTelemetryEnabled(env: Record<string, unknown>): boolean {
  return typeof env.MONGODB_URI === 'string' && env.MONGODB_URI.trim() !== '';
}

export function buildMongoClientOptions(
  env: Pick<
    EnvironmentVariables,
    'MONGODB_MAX_POOL_SIZE' | 'MONGODB_SERVER_SELECTION_TIMEOUT_MS'
  >,
): MongoClientOptions {
  return {
    appName: 'fleetops-api',
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  };
}
