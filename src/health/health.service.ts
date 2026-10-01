import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

export type DependencyStatus = 'up' | 'down';

export type HealthStatus = {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  database: DependencyStatus;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    const database = await this.checkDatabase();

    return {
      status: database === 'up' ? 'ok' : 'error',
      service: 'fleetops-api',
      timestamp: new Date().toISOString(),
      database,
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return 'down';
    }
  }
}
