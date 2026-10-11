import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { PrismaVehicleDirectory } from './prisma-vehicle-directory.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, PrismaVehicleDirectory],
  exports: [PrismaVehicleDirectory],
})
export class VehiclesModule {}
