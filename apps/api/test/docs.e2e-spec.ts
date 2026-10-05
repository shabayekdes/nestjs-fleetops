import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

interface Doc {
  openapi: string;
  components: { securitySchemes: Record<string, unknown> };
  paths: Record<string, Record<string, { security?: unknown[] }>>;
}

describe('API docs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    const doc = res.body as Doc;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components.securitySchemes).toHaveProperty('bearer');
    expect(doc.paths).toHaveProperty('/api/v1/vehicles');
    expect(doc.paths).toHaveProperty('/api/v1/auth/login');
  });

  it('login has no security, vehicles list requires bearer', async () => {
    const doc = (await request(app.getHttpServer()).get('/api/docs-json'))
      .body as Doc;
    expect(doc.paths['/api/v1/auth/login'].post.security).toBeUndefined();
    expect(doc.paths['/api/v1/vehicles'].get.security).toEqual([
      { bearer: [] },
    ]);
  });

  it('serves the UI', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
