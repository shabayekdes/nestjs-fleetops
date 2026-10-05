import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { DatabaseModule } from '../database/database.module.js';
import { HealthController } from './health.controller.js';
import { HealthService, MIGRATIONS_DIR } from './health.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: MIGRATIONS_DIR,
      useValue: join(process.cwd(), 'prisma', 'migrations'),
    },
  ],
})
export class HealthModule {}
