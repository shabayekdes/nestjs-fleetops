import { Injectable, NotFoundException } from '@nestjs/common';
import { escapeLike } from '../../common/like.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ListVehicleMakesQueryDto } from './dto/list-vehicle-makes-query.dto.js';
import type {
  VehicleMakeListResponseDto,
  VehicleMakeResponseDto,
} from './dto/vehicle-make-response.dto.js';

const VEHICLE_MAKE_SELECT = {
  id: true,
  name: true,
  slug: true,
  active: true,
} satisfies Prisma.VehicleMakeSelect;

type VehicleMakeRow = Prisma.VehicleMakeGetPayload<{
  select: typeof VEHICLE_MAKE_SELECT;
}>;

const toVehicleMakeResponse = (
  row: VehicleMakeRow,
): VehicleMakeResponseDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  active: row.active,
});

@Injectable()
export class VehicleMakesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Master data is global: unlike every other service in FleetOps, this one
   * takes no organizationId.
   */
  async findAll(
    query: ListVehicleMakesQueryDto,
  ): Promise<VehicleMakeListResponseDto> {
    const { page, limit, search, includeInactive } = query;
    // No organizationId filter: vehicle makes are shared by all tenants.
    const where: Prisma.VehicleMakeWhereInput = {
      ...(includeInactive !== true && { active: true }),
      ...(search !== undefined && {
        name: { contains: escapeLike(search), mode: 'insensitive' },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicleMake.findMany({
        where,
        select: VEHICLE_MAKE_SELECT,
        // name is unique, so it is a stable order without a tie-breaker.
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicleMake.count({ where }),
    ]);
    return {
      data: rows.map(toVehicleMakeResponse),
      meta: { page, limit, total },
    };
  }

  /**
   * Retired makes are returned too (active: false): vehicles that already
   * reference one still need to display it.
   */
  async findOneBySlug(slug: string): Promise<VehicleMakeResponseDto> {
    // Slugs are stored lowercase, so /vehicle-makes/BMW finds "bmw".
    const row = await this.prisma.vehicleMake.findUnique({
      where: { slug: slug.toLowerCase() },
      select: VEHICLE_MAKE_SELECT,
    });
    if (!row) throw new NotFoundException('Vehicle make not found');
    return toVehicleMakeResponse(row);
  }
}
