import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/app.setup.js';
import { MongoConnection } from '../src/telemetry/mongo/mongo-connection.js';

// An explicitly empty MONGODB_URI wins over .env.test (env is never
// overridden) and means "telemetry disabled". AppModule is imported
// dynamically so its conditional module sees this environment.
describe('Telemetry disabled (e2e)', () => {
  const saved = {
    uri: process.env.MONGODB_URI,
    db: process.env.MONGODB_DB,
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.MONGODB_URI = '';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const [key, value] of [
        ['MONGODB_URI', saved.uri],
        ['MONGODB_DB', saved.db],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('boots and reports telemetry disabled with status ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'up',
      migrations: 'applied',
      telemetry: 'disabled',
    });
  });

  it('does not expose telemetry routes (GET latest and POST readings return 404)', async () => {
    const get = await request(app.getHttpServer()).get(
      '/api/v1/telemetry/latest',
    );
    const post = await request(app.getHttpServer())
      .post('/api/v1/telemetry/readings')
      .send({});
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
  });

  it('does not register the Mongo connection', () => {
    expect(() => app.get(MongoConnection, { strict: false })).toThrow();
  });
});
