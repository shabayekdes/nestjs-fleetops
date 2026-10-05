import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FuelLogsController } from './fuel-logs.controller.js';
import { FuelLogsService } from './fuel-logs.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [FuelLogsController],
  providers: [FuelLogsService],
})
export class FuelLogsModule {}
