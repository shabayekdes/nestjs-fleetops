import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import {
  HealthService,
  type HealthStatus,
  type LivenessStatus,
  type ReadinessStatus,
} from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthStatus> {
    const health = await this.healthService.check();

    // 503 lets load balancers/orchestrators take the instance out of rotation.
    // The health body is returned as is (not the standard error shape).
    if (health.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }

  @Public()
  @Get('live')
  live(): LivenessStatus {
    return this.healthService.liveness();
  }

  @Public()
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessStatus> {
    const readiness = await this.healthService.readiness();

    if (readiness.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return readiness;
  }
}
