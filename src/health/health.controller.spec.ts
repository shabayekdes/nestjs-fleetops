import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns ok status with service name and ISO timestamp', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('fleetops-api');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
