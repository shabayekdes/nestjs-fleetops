import { Injectable, NotFoundException } from '@nestjs/common';
import { escapeLike } from '../../common/like.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ListVehicleTypesQueryDto } from './dto/list-vehicle-types-query.dto.js';
import type {
  VehicleTypeListResponseDto,
  VehicleTypeResponseDto,
} from './dto/vehicle-type-response.dto.js';

const VEHICLE_TYPE_SELECT = {
  id: true,
  name: true,
  slug: true,
  active: true,
} satisfies Prisma.VehicleTypeSelect;

type VehicleTypeRow = Prisma.VehicleTypeGetPayload<{
  select: typeof VEHICLE_TYPE_SELECT;
}>;

const toVehicleTypeResponse = (
  row: VehicleTypeRow,
): VehicleTypeResponseDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  active: row.active,
});

@Injectable()
export class VehicleTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Master data is global: unlike every other service in FleetOps, this one
   * takes no organizationId.
   */
  async findAll(
    query: ListVehicleTypesQueryDto,
  ): Promise<VehicleTypeListResponseDto> {
    const { page, limit, search, includeInactive } = query;

    // No organizationId filter: vehicle types are shared by all tenants.
    const where: Prisma.VehicleTypeWhereInput = {
      ...(includeInactive !== true && { active: true }),
      ...(search !== undefined && {
        name: { contains: escapeLike(search), mode: 'insensitive' },
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicleType.findMany({
        where,
        select: VEHICLE_TYPE_SELECT,
        // name is unique, so it is a stable order without a tie-breaker.
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicleType.count({ where }),
    ]);

    return {
      data: rows.map(toVehicleTypeResponse),
      meta: { page, limit, total },
    };
  }

  /**
   * Retired types are returned too (active: false): vehicles that already
   * use one still need to display it.
   */
  async findOneBySlug(slug: string): Promise<VehicleTypeResponseDto> {
    // Slugs are stored lowercase, so /vehicle-types/VAN finds "van".
    const row = await this.prisma.vehicleType.findUnique({
      where: { slug: slug.toLowerCase() },
      select: VEHICLE_TYPE_SELECT,
    });
    if (!row) throw new NotFoundException('Vehicle type not found');
    return toVehicleTypeResponse(row);
  }
}
