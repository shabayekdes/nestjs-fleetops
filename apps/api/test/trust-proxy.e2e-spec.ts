import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/app.setup.js';
import { buildThrottlerOptions } from '../src/auth/throttling.js';

const LIMIT = 100;
const IP_LIMIT = 3;

describe('TRUST_PROXY=1 (e2e)', () => {
  let app: INestApplication<App>;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  const previous = process.env.TRUST_PROXY;
  const slug = `tp-${randomUUID().slice(0, 8)}`;

  const httpEntries = (): Record<string, unknown>[] =>
    logSpy.mock.calls
      .map(([entry]) => entry as Record<string, unknown>)
      .filter((entry) => entry?.msg === 'request completed');

  const login = (xff: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', xff)
      .send({
        organizationSlug: slug,
        email: 'nobody@example.test',
        password: 'wrong-password',
      });

  beforeAll(async () => {
    // Static imports are hoisted in ESM and real env overrides .env.test, so
    // set the variable first and load the module graph afterwards.
    process.env.TRUST_PROXY = '1';
    const { AppModule } = await import('../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue(
        buildThrottlerOptions({
          ttlSeconds: 60,
          limit: LIMIT,
          ipLimit: IP_LIMIT,
        }),
      )
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
    await app?.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('logs the forwarded client address as ip', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('X-Forwarded-For', '203.0.113.7');

    const entries = httpEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].ip).toBe('203.0.113.7');
  });

  it('trusts only one hop: the last X-Forwarded-For entry wins', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('X-Forwarded-For', '198.51.100.1, 203.0.113.7');

    const entries = httpEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].ip).toBe('203.0.113.7');
  });

  it('throttles per forwarded client IP, not per socket address', async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      await login('203.0.113.10').expect(401);
    }
    await login('203.0.113.10').expect(429);
    // A different forwarded client is unaffected by the first one's limit.
    await login('203.0.113.11').expect(401);
  });
});
