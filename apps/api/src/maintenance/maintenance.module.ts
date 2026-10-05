import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { MaintenanceRecordsController } from './maintenance-records.controller.js';
import { MaintenanceRecordsService } from './maintenance-records.service.js';
import { ServiceStatusJob } from './service-status.job.js';

@Module({
  imports: [DatabaseModule],
  controllers: [MaintenanceRecordsController],
  providers: [MaintenanceRecordsService, ServiceStatusJob],
})
export class MaintenanceModule {}
