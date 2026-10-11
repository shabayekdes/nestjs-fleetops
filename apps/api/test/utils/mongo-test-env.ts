import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

export interface MongoTestEnv {
  uri: string;
  dbName: string;
}

const clean = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

/**
 * Mongo settings for integration tests: process.env first (an empty value
 * means "unset"), else .env.test. Undefined when Mongo is not configured.
 */
export function mongoTestEnv(): MongoTestEnv | undefined {
  let uri = clean(process.env.MONGODB_URI);
  let dbName = clean(process.env.MONGODB_DB);

  // An explicitly empty MONGODB_URI means "unset", even if .env.test has one.
  const explicitlyEmpty = process.env.MONGODB_URI !== undefined && !uri;
  if (!explicitlyEmpty && (!uri || !dbName)) {
    try {
      const file = parse(readFileSync(join(process.cwd(), '.env.test')));
      uri ??= clean(file.MONGODB_URI);
      dbName ??= clean(file.MONGODB_DB);
    } catch {
      // No .env.test: Mongo stays unconfigured.
    }
  }

  if (!uri) return undefined;
  if (!dbName || !dbName.endsWith('_test')) {
    throw new Error(
      `MONGODB_DB must end with _test for integration tests (got "${dbName ?? ''}")`,
    );
  }
  return { uri, dbName };
}

/** Runs the suite when Mongo is configured; skips locally, throws in CI. */
export const describeWithMongo: jest.Describe = (() => {
  if (mongoTestEnv()) return describe;
  if (process.env.CI === 'true') {
    throw new Error('MONGODB_URI must be set in CI');
  }
  return describe.skip;
})();

export const uniqueDbName = (base: string): string =>
  `${base}_${randomUUID().slice(0, 8)}`;
