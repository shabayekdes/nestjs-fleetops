import { Test } from '@nestjs/testing';
import { MongoServerSelectionError } from 'mongodb';
import { configureApp } from '../src/app.setup.js';

// Telemetry enabled but MongoDB unreachable: boot must fail fast.
describe('Telemetry unreachable (e2e)', () => {
  const keys = [
    'MONGODB_URI',
    'MONGODB_DB',
    'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  afterAll(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('fails app.init() with a server selection error', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/?directConnection=true';
    process.env.MONGODB_DB = 'fleetops_telemetry_test';
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '500';

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);

    try {
      await expect(app.init()).rejects.toBeInstanceOf(
        MongoServerSelectionError,
      );
    } finally {
      await app.close().catch(() => undefined);
    }
  });
});
