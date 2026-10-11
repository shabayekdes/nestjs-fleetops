import {
  buildMongoClientOptions,
  isTelemetryEnabled,
} from './telemetry-config.js';

describe('isTelemetryEnabled', () => {
  it.each([undefined, '', '   ', null, 5])('is false for %j', (value) => {
    expect(isTelemetryEnabled({ MONGODB_URI: value })).toBe(false);
  });

  it('is false when the key is absent', () => {
    expect(isTelemetryEnabled({})).toBe(false);
  });

  it('is true for a connection string', () => {
    expect(isTelemetryEnabled({ MONGODB_URI: 'mongodb://x' })).toBe(true);
  });
});

describe('buildMongoClientOptions', () => {
  it('returns exactly the pool, timeout and app name', () => {
    expect(
      buildMongoClientOptions({
        MONGODB_MAX_POOL_SIZE: 12,
        MONGODB_SERVER_SELECTION_TIMEOUT_MS: 700,
      }),
    ).toEqual({
      appName: 'fleetops-api',
      maxPoolSize: 12,
      serverSelectionTimeoutMS: 700,
    });
  });
});
