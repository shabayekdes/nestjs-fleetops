import { Injectable, NotFoundException } from '@nestjs/common';
import { escapeLike } from '../../common/like.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ListVehicleModelsQueryDto } from './dto/list-vehicle-models-query.dto.js';
import type {
  VehicleModelListResponseDto,
  VehicleModelResponseDto,
} from './dto/vehicle-model-response.dto.js';

const VEHICLE_MODEL_SELECT = {
  id: true,
  name: true,
  slug: true,
  active: true,
} satisfies Prisma.VehicleModelSelect;

type VehicleModelRow = Prisma.VehicleModelGetPayload<{
  select: typeof VEHICLE_MODEL_SELECT;
}>;

const toVehicleModelResponse = (
  row: VehicleModelRow,
): VehicleModelResponseDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  active: row.active,
});

@Injectable()
export class VehicleModelsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Models of one make. A model is offered only if it AND its make are
   * active, so a retired make offers no models unless includeInactive=true.
   */
  async findAllForMake(
    makeId: string,
    query: ListVehicleModelsQueryDto,
  ): Promise<VehicleModelListResponseDto> {
    const { page, limit, search, includeInactive } = query;
    const empty = { data: [], meta: { page, limit, total: 0 } };

    // No organizationId: master data is global; makeId is the only scope.
    // A separate existence check tells an unknown make (404) from a make
    // without models (empty list). No transaction: the catalog only changes
    // through the seed/migrations.
    const make = await this.prisma.vehicleMake.findUnique({
      where: { id: makeId },
      select: { active: true },
    });
    if (!make) throw new NotFoundException('Vehicle make not found');
    if (!make.active && includeInactive !== true) return empty;

    const where: Prisma.VehicleModelWhereInput = {
      makeId,
      ...(includeInactive !== true && { active: true }),
      ...(search !== undefined && {
        name: { contains: escapeLike(search), mode: 'insensitive' },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicleModel.findMany({
        where,
        select: VEHICLE_MODEL_SELECT,
        // (makeId, name) is unique, so name is a stable order within a make.
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicleModel.count({ where }),
    ]);
    return {
      data: rows.map(toVehicleModelResponse),
      meta: { page, limit, total },
    };
  }
}
