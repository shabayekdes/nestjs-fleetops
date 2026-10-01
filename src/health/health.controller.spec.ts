import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService, type HealthStatus } from './health.service.js';

describe('HealthController', () => {
  const check = jest.fn<() => Promise<HealthStatus>>();
  let controller: HealthController;

  const health = (overrides: Partial<HealthStatus>): HealthStatus => ({
    status: 'ok',
    service: 'fleetops-api',
    timestamp: new Date().toISOString(),
    database: 'up',
    ...overrides,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check } }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns the health status when healthy', async () => {
    const healthy = health({});
    check.mockResolvedValue(healthy);

    await expect(controller.check()).resolves.toEqual(healthy);
  });

  it('throws 503 when a dependency is down', async () => {
    check.mockResolvedValue(health({ status: 'error', database: 'down' }));

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
