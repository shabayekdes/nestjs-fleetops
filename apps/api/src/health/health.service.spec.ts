import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../database/prisma.service.js';
import { HealthService, MIGRATIONS_DIR } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  let service: HealthService;
  let dir: string;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;
  let errorSpy: jest.SpiedFunction<Logger['error']>;

  const build = async (migrationsDir: string) => {
    // PrismaService is replaced in the DI container: no database needed.
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: MIGRATIONS_DIR, useValue: migrationsDir },
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();
    return moduleRef.get(HealthService);
  };

  const shipped = async (...names: string[]) => {
    for (const name of names) await mkdir(join(dir, name));
  };
  const rows = (...names: string[]) =>
    names.map((n) => ({ migration_name: n }));

  beforeEach(async () => {
    queryRaw.mockReset();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    dir = await mkdtemp(join(tmpdir(), 'fleetops-migrations-'));
    service = await build(dir);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  describe('check', () => {
    it('reports ok when the database responds', async () => {
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.check();

      expect(result).toMatchObject({
        status: 'ok',
        service: 'fleetops-api',
        database: 'up',
      });
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('reports error when the database query fails', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      const result = await service.check();

      expect(result).toMatchObject({ status: 'error', database: 'down' });
    });
  });

  describe('liveness', () => {
    it('returns ok with service and an ISO timestamp and never queries', () => {
      const result = service.liveness();

      expect(result).toEqual({
        status: 'ok',
        service: 'fleetops-api',
        timestamp: expect.any(String) as string,
      });
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('is ok when every shipped migration is applied', async () => {
      await shipped('001_a', '002_b');
      queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce(rows('001_a', '002_b'));

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'ok',
        service: 'fleetops-api',
        database: 'up',
        migrations: 'applied',
      });
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it('is pending and warns with the name when one migration is missing', async () => {
      await shipped('001_a', '002_b');
      queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce(rows('001_a'));

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'error',
        database: 'up',
        migrations: 'pending',
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('002_b');
    });

    it('ignores migration_lock.toml (a file) in the directory', async () => {
      await shipped('001_a');
      await writeFile(
        join(dir, 'migration_lock.toml'),
        'provider = "postgresql"',
      );
      queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce(rows('001_a'));

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'ok',
        migrations: 'applied',
      });
    });

    it('stays applied when the database has extra unknown migrations', async () => {
      await shipped('001_a');
      queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce(rows('001_a', '999_from_newer_build'));

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'ok',
        migrations: 'applied',
      });
    });

    it('is down and unknown when the database is down, skipping the migrations query', async () => {
      await shipped('001_a');
      queryRaw.mockRejectedValueOnce(new Error('connection refused'));

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'error',
        database: 'down',
        migrations: 'unknown',
      });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('is unknown and logs the error when the migrations query rejects', async () => {
      await shipped('001_a');
      const failure = new Error('relation "_prisma_migrations" does not exist');
      queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockRejectedValueOnce(failure);

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'error',
        database: 'up',
        migrations: 'unknown',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrations health check failed'),
        failure,
      );
    });

    it('is unknown when the migrations directory is missing', async () => {
      const missing = await build(join(dir, 'does-not-exist'));
      queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      await expect(missing.readiness()).resolves.toMatchObject({
        status: 'error',
        database: 'up',
        migrations: 'unknown',
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('is unknown when the migrations directory is empty', async () => {
      queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      await expect(service.readiness()).resolves.toMatchObject({
        status: 'error',
        migrations: 'unknown',
      });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
