import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // Fail fast instead of hanging when PostgreSQL is unreachable.
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    // With a driver adapter, $connect() does not open a connection (pg.Pool is
    // lazy), so run a real query to fail fast at boot if PostgreSQL is down.
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
