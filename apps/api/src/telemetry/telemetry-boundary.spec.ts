import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN =
  /from\s+['"][^'"]*\/(vehicles|drivers|assignments|maintenance|fuel-logs|users|database)\//;

const tsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });

describe('telemetry module boundary', () => {
  const files = tsFiles(ROOT);

  it('scans the telemetry sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))(
    '%s does not import core feature modules',
    (_name, file) => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => FORBIDDEN.test(line));
      expect(offending).toEqual([]);
    },
  );
});
