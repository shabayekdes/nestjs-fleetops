import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListVehicleModelsQueryDto } from './dto/list-vehicle-models-query.dto.js';
import type { VehicleModelListResponseDto } from './dto/vehicle-model-response.dto.js';
import { VehicleModelsService } from './vehicle-models.service.js';

// Nested under the make, like FuelLogsController under vehicles/:vehicleId.
// Same access as VehicleMakesController: any authenticated user, no @Roles().
@ApiTags('vehicle-models')
@ApiBearerAuth()
@Controller('master-data/vehicle-makes/:makeId/models')
export class VehicleModelsController {
  constructor(private readonly service: VehicleModelsService) {}

  /**
   * List the models of one make, alphabetically by name.
   *
   * Only active models of an active make unless includeInactive=true.
   * `search` is a case-insensitive match anywhere in the model name.
   * 404 if the make does not exist.
   */
  @Get()
  findAll(
    @Param('makeId', new ParseUUIDPipe({ version: '7' })) makeId: string,
    @Query() query: ListVehicleModelsQueryDto,
  ): Promise<VehicleModelListResponseDto> {
    return this.service.findAllForMake(makeId, query);
  }
}
