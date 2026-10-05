import { jest } from '@jest/globals';
import type { Response } from 'express';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import type {
  HealthResponseDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './health-response.dto.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  const check = jest.fn<() => Promise<HealthResponseDto>>();
  const liveness = jest.fn<() => LivenessResponseDto>();
  const readiness = jest.fn<() => Promise<ReadinessResponseDto>>();
  let controller: HealthController;
  const status = jest.fn();
  const res = { status } as unknown as Response;

  const health = (
    overrides: Partial<HealthResponseDto>,
  ): HealthResponseDto => ({
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
      providers: [
        { provide: HealthService, useValue: { check, liveness, readiness } },
      ],
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

  describe('live', () => {
    it('returns the liveness result and never sets a status', () => {
      const body: LivenessResponseDto = {
        status: 'ok',
        service: 'fleetops-api',
        timestamp: new Date().toISOString(),
      };
      liveness.mockReturnValue(body);

      expect(controller.live()).toEqual(body);
      expect(status).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    const ready = (
      overrides: Partial<ReadinessResponseDto>,
    ): ReadinessResponseDto => ({
      ...health({}),
      migrations: 'applied',
      ...overrides,
    });

    it('passes the body through without a status call when ok', async () => {
      const body = ready({});
      readiness.mockResolvedValue(body);

      await expect(controller.ready(res)).resolves.toEqual(body);
      expect(status).not.toHaveBeenCalled();
    });

    it('sets 503 and returns the body when migrations are pending', async () => {
      const body = ready({ status: 'error', migrations: 'pending' });
      readiness.mockResolvedValue(body);

      await expect(controller.ready(res)).resolves.toEqual(body);
      expect(status).toHaveBeenCalledWith(503);
    });

    it('sets 503 when the database is down', async () => {
      const body = ready({
        status: 'error',
        database: 'down',
        migrations: 'unknown',
      });
      readiness.mockResolvedValue(body);

      await expect(controller.ready(res)).resolves.toEqual(body);
      expect(status).toHaveBeenCalledWith(503);
    });
  });
});
