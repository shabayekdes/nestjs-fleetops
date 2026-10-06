import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/api, resolved from this file so teardown works from any directory.
const API_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../api',
);

/**
 * Removes the e2e rows the API cannot delete (drivers and vehicles with
 * assignment history) with the API's test-only cleanup script. It forces
 * NODE_ENV=test itself, so it only touches the database in the API's
 * `.env.test` (or DATABASE_URL in CI) and only rows with the E2E prefixes.
 */
export default function globalTeardown(): void {
  execFileSync('npm', ['--prefix', API_DIR, 'run', 'db:test:e2e-cleanup'], {
    stdio: 'inherit',
  });
}
