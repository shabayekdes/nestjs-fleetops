import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TELEMETRY_HEALTH } from '../src/health/telemetry-health.js';
import {
  MONGO_CLIENT,
  TELEMETRY_READINGS_COLLECTION,
  VEHICLE_LATEST_STATUS_COLLECTION,
} from '../src/telemetry/mongo/mongo.tokens.js';
import type { Collection } from 'mongodb';
import { describeWithMongo, mongoTestEnv } from './utils/mongo-test-env.js';

// Needs `npm run mongo:test:setup` to have been run against the test database.
describeWithMongo('Telemetry module with MongoDB (e2e)', () => {
  const env = mongoTestEnv();

  describe('connected', () => {
    let app: INestApplication<App>;
    let closed = false;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      if (!closed) await app.close();
    });

    it('reports telemetry up on /health/ready with status ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        database: 'up',
        migrations: 'applied',
        telemetry: 'up',
      });
    });

    it('keeps /health and /health/live free of telemetry', async () => {
      const health = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      const live = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      expect(health.body).not.toHaveProperty('telemetry');
      expect(live.body).not.toHaveProperty('telemetry');
    });

    it('provides typed collections bound to the configured database', () => {
      const readings = app.get<Collection>(TELEMETRY_READINGS_COLLECTION, {
        strict: false,
      });
      const latest = app.get<Collection>(VEHICLE_LATEST_STATUS_COLLECTION, {
        strict: false,
      });

      expect(readings.collectionName).toBe('telemetry_readings');
      expect(latest.collectionName).toBe('vehicle_latest_status');
      expect(readings.dbName).toBe(env!.dbName);
      expect(latest.dbName).toBe(env!.dbName);
    });

    it('closes the Mongo client on app shutdown', async () => {
      const client = app.get<MongoClient>(MONGO_CLIENT, { strict: false });

      await app.close();
      closed = true;

      await expect(
        client.db(env!.dbName).command({ ping: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('with a failing telemetry ping', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(TELEMETRY_HEALTH)
        .useValue({ ping: () => Promise.reject(new Error('mongo down')) })
        .compile();
      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('stays 200 with status ok and reports telemetry down', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        database: 'up',
        migrations: 'applied',
        telemetry: 'down',
      });
    });
  });
});
