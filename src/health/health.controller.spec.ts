import { jest } from '@jest/globals';
import type { Response } from 'express';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService, type HealthStatus } from './health.service.js';

describe('HealthController', () => {
  const check = jest.fn<() => Promise<HealthStatus>>();
  let controller: HealthController;
  const status = jest.fn();
  const res = { status } as unknown as Response;

  const health = (overrides: Partial<HealthStatus>): HealthStatus => ({
    status: 'ok',
    service: 'fleetops-api',
    timestamp: new Date().toISOString(),
    database: 'up',
    ...overrides,
  });

  beforeEach(async () => {
    status.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check } }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns the health status when healthy', async () => {
    const healthy = health({});
    check.mockResolvedValue(healthy);

    await expect(controller.check(res)).resolves.toEqual(healthy);
    expect(status).not.toHaveBeenCalled();
  });

  it('sets 503 and returns the body when a dependency is down', async () => {
    const unhealthy = health({ status: 'error', database: 'down' });
    check.mockResolvedValue(unhealthy);

    await expect(controller.check(res)).resolves.toEqual(unhealthy);
    expect(status).toHaveBeenCalledWith(503);
  });
});
