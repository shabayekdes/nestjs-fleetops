import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListVehicleMakesQueryDto } from './dto/list-vehicle-makes-query.dto.js';
import type {
  VehicleMakeListResponseDto,
  VehicleMakeResponseDto,
} from './dto/vehicle-make-response.dto.js';
import { VehicleMakesService } from './vehicle-makes.service.js';

// Read access: any authenticated user, no @Roles(). Stays behind the global
// JWT guard (no client needs it before login), and every role that can see
// vehicles may see their makes; ADMIN and MANAGER need it for the vehicle form.
// Read-only on purpose: ADMIN is per organization but this data is shared by
// all of them, so the catalog is changed only through the seed/migrations.
@ApiTags('vehicle-makes')
@ApiBearerAuth()
@Controller('master-data/vehicle-makes')
export class VehicleMakesController {
  constructor(private readonly service: VehicleMakesService) {}

  /**
   * List vehicle makes, alphabetically by name.
   *
   * Only active makes unless includeInactive=true. `search` is a
   * case-insensitive match anywhere in the name. Paginated like other lists.
   */
  @Get()
  findAll(
    @Query() query: ListVehicleMakesQueryDto,
  ): Promise<VehicleMakeListResponseDto> {
    return this.service.findAll(query);
  }

  /**
   * Get one vehicle make by its slug (case-insensitive), including retired
   * makes. 404 if no make has this slug.
   */
  @Get(':slug')
  findOneBySlug(@Param('slug') slug: string): Promise<VehicleMakeResponseDto> {
    return this.service.findOneBySlug(slug);
  }
}
