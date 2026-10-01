import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = jest.fn<() => Promise<unknown>>();
  let service: HealthService;

  beforeEach(async () => {
    queryRaw.mockReset();

    // PrismaService is replaced in the DI container: no database needed.
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

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
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result).toMatchObject({ status: 'error', database: 'down' });
  });
});
