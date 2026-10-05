import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { MIGRATIONS_DIR } from '../src/health/health.service.js';

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

  describe('GET /api/v1/health/live', () => {
    it('returns 200 without a token and exactly 3 keys', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'service',
        'status',
        'timestamp',
      ]);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('fleetops-api');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('returns 200 without a token when the database is up and migrations are applied', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'database',
        'migrations',
        'service',
        'status',
        'timestamp',
      ]);
      expect(body).toMatchObject({
        status: 'ok',
        service: 'fleetops-api',
        database: 'up',
        migrations: 'applied',
      });
      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    });
  });

  it('returns 404 for unversioned routes', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('returns 404 for unprefixed live and ready routes', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(404);
    await request(app.getHttpServer()).get('/health/ready').expect(404);
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

  it('keeps /health/live at 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('returns 503 on /health/ready with the plain health body', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      service: 'fleetops-api',
      database: 'down',
      migrations: 'unknown',
    });
    expect(response.body).not.toHaveProperty('requestId');
    expect(response.body).not.toHaveProperty('error');
  });
});

describe('GET /api/v1/health/ready with a pending migration (e2e)', () => {
  const PENDING = '29991231000000_not_applied';
  let app: INestApplication<App>;
  let tmpDir: string;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    tmpDir = await mkdtemp(join(tmpdir(), 'fleetops-e2e-migrations-'));
    const entries = await readdir(join(process.cwd(), 'prisma', 'migrations'), {
      withFileTypes: true,
    });
    for (const entry of entries.filter((e) => e.isDirectory())) {
      await mkdir(join(tmpDir, entry.name));
    }
    await mkdir(join(tmpDir, PENDING));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MIGRATIONS_DIR)
      .useValue(tmpDir)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      await app?.close();
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns 503 with migrations pending and no migration name in the body', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      database: 'up',
      migrations: 'pending',
    });
    expect(JSON.stringify(response.body)).not.toContain(PENDING);
  });

  it('keeps /health/live at 200', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
