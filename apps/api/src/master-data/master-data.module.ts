import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { VehicleMakesController } from './vehicle-makes/vehicle-makes.controller.js';
import { VehicleMakesService } from './vehicle-makes/vehicle-makes.service.js';
import { VehicleModelsController } from './vehicle-models/vehicle-models.controller.js';
import { VehicleModelsService } from './vehicle-models/vehicle-models.service.js';

/**
 * Global (non-tenant) reference data, served under /api/v1/master-data.
 * Unlike every other feature module, nothing here is scoped by organizationId.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [VehicleMakesController, VehicleModelsController],
  providers: [VehicleMakesService, VehicleModelsService],
})
export class MasterDataModule {}
