import { Inject, Injectable, Logger } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { PrismaService } from '../database/prisma.service.js';
import {
  type DependencyStatus,
  HealthResponseDto,
  LivenessResponseDto,
  type MigrationsStatus,
  ReadinessResponseDto,
} from './health-response.dto.js';

/** DI token for the directory holding the migrations this build ships. */
export const MIGRATIONS_DIR = 'MIGRATIONS_DIR';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MIGRATIONS_DIR) private readonly migrationsDir: string,
  ) {}

  async check(): Promise<HealthResponseDto> {
    const database = await this.checkDatabase();

    return {
      status: database === 'up' ? 'ok' : 'error',
      service: 'fleetops-api',
      timestamp: new Date().toISOString(),
      database,
    };
  }

  /** Touches no dependency: a database outage must never restart the process. */
  liveness(): LivenessResponseDto {
    return {
      status: 'ok',
      service: 'fleetops-api',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResponseDto> {
    const database = await this.checkDatabase();
    const migrations =
      database === 'up' ? await this.checkMigrations() : 'unknown';

    return {
      status: database === 'up' && migrations === 'applied' ? 'ok' : 'error',
      service: 'fleetops-api',
      timestamp: new Date().toISOString(),
      database,
      migrations,
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

  /**
   * Subset check: every migration shipped in this build must be applied.
   * Unknown newer rows are ignored so old instances stay ready during a
   * rolling deploy.
   */
  private async checkMigrations(): Promise<MigrationsStatus> {
    try {
      const entries = await readdir(this.migrationsDir, {
        withFileTypes: true,
      });
      const shipped = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      if (shipped.length === 0) {
        this.logger.error(
          `Migrations health check failed: no migrations found in ${this.migrationsDir}`,
        );
        return 'unknown';
      }

      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      const applied = new Set(rows.map((r) => r.migration_name));
      const pending = shipped.filter((name) => !applied.has(name));
      if (pending.length > 0) {
        this.logger.warn(`Pending migrations: ${pending.join(', ')}`);
        return 'pending';
      }
      return 'applied';
    } catch (error) {
      this.logger.error('Migrations health check failed', error);
      return 'unknown';
    }
  }
}
