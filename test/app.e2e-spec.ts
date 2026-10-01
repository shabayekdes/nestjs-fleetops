import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('FleetOps API (e2e)', () => {
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
    await app.close();
  });

  describe('GET /api/v1', () => {
    it('returns a running message', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1')
        .expect(200);

      expect(response.body).toEqual({ message: 'FleetOps API is running' });
    });
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 with database up', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.service).toBe('fleetops-api');
      expect(body.database).toBe('up');
      expect(typeof body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
    });
  });

  it('returns 404 for unversioned routes', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});

describe('GET /api/v1/health with the database down (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Swap the real PrismaService for one whose queries fail.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.reject(new Error('connection refused')),
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 with database down', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      service: 'fleetops-api',
      database: 'down',
    });
  });
});
