import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import {
  HealthResponseDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @ApiServiceUnavailableResponse({
    type: HealthResponseDto,
    description:
      'A dependency is down; the body is the health status, not the error format.',
  })
  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponseDto> {
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
  live(): LivenessResponseDto {
    return this.healthService.liveness();
  }

  @Public()
  @ApiServiceUnavailableResponse({
    type: ReadinessResponseDto,
    description:
      'A dependency is down; the body is the health status, not the error format.',
  })
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponseDto> {
    const readiness = await this.healthService.readiness();

    if (readiness.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return readiness;
  }
}
