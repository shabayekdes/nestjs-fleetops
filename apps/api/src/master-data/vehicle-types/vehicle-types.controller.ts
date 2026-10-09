import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListVehicleTypesQueryDto } from './dto/list-vehicle-types-query.dto.js';
import type {
  VehicleTypeListResponseDto,
  VehicleTypeResponseDto,
} from './dto/vehicle-type-response.dto.js';
import { VehicleTypesService } from './vehicle-types.service.js';

// Same access as VehicleMakesController: any authenticated user, no @Roles(),
// read-only (the shared catalog changes only through the seed/migrations).
@ApiTags('vehicle-types')
@ApiBearerAuth()
@Controller('master-data/vehicle-types')
export class VehicleTypesController {
  constructor(private readonly service: VehicleTypesService) {}

  /**
   * List vehicle types, alphabetically by name.
   *
   * Only active types unless includeInactive=true. `search` is a
   * case-insensitive match anywhere in the name. Paginated like other lists.
   */
  @Get()
  findAll(
    @Query() query: ListVehicleTypesQueryDto,
  ): Promise<VehicleTypeListResponseDto> {
    return this.service.findAll(query);
  }

  /**
   * Get one vehicle type by its slug (case-insensitive), including retired
   * types. 404 if no type has this slug.
   */
  @Get(':slug')
  findOneBySlug(@Param('slug') slug: string): Promise<VehicleTypeResponseDto> {
    return this.service.findOneBySlug(slug);
  }
}
