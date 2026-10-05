import { createAppLogger, logLevelsFrom } from './app-logger.js';

describe('logLevelsFrom', () => {
  it('returns the level and more severe ones', () => {
    expect(logLevelsFrom('warn')).toEqual(['warn', 'error', 'fatal']);
    expect(logLevelsFrom('fatal')).toEqual(['fatal']);
    expect(logLevelsFrom('verbose')).toEqual([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });
});

describe('createAppLogger', () => {
  const options = (logger: unknown) =>
    (logger as { options: { json?: boolean; logLevels?: string[] } }).options;

  it('uses JSON only in production', () => {
    expect(options(createAppLogger('production', 'log')).json).toBe(true);
    expect(options(createAppLogger('development', 'log')).json).toBe(false);
    expect(options(createAppLogger('test', 'log')).json).toBe(false);
  });

  it('applies the log levels', () => {
    expect(options(createAppLogger('test', 'warn')).logLevels).toEqual([
      'warn',
      'error',
      'fatal',
    ]);
  });
});
