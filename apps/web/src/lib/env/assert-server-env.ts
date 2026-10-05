import 'server-only';
import { getServerEnv } from './server';

/**
 * Fails fast at server start. The process exits here (not in
 * instrumentation.ts) because a thrown error under `next start` is only
 * logged, and `process.exit` must not appear in Edge-compiled code.
 */
export function assertServerEnv(): void {
  try {
    getServerEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
