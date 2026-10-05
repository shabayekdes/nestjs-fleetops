import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseDateOnly, toDateOnly } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateFuelLogDto } from './dto/create-fuel-log.dto.js';
import type {
  FuelLogListResponseDto,
  FuelLogResponseDto,
} from './dto/fuel-log-response.dto.js';
import type { ListFuelLogsQueryDto } from './dto/list-fuel-logs-query.dto.js';
import type { UpdateFuelLogDto } from './dto/update-fuel-log.dto.js';

const FUEL_LOG_SELECT = {
  id: true,
  vehicleId: true,
  fueledOn: true,
  liters: true,
  totalCost: true,
  odometerKm: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FuelLogSelect;

type FuelLogRow = Prisma.FuelLogGetPayload<{ select: typeof FUEL_LOG_SELECT }>;

const toFuelLogResponse = (row: FuelLogRow): FuelLogResponseDto => ({
  id: row.id,
  vehicleId: row.vehicleId,
  fueledOn: toDateOnly(row.fueledOn),
  liters: row.liters.toFixed(3),
  totalCost: row.totalCost.toFixed(2),
  odometerKm: row.odometerKm,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const VEHICLE_NOT_FOUND = 'Vehicle not found';
const FUEL_LOG_NOT_FOUND = 'Fuel log not found';

/** Maps known Prisma errors to HTTP exceptions; anything else is returned unchanged. */
function toHttpError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    return new NotFoundException(FUEL_LOG_NOT_FOUND);
  }
  return error;
}

@Injectable()
export class FuelLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    vehicleId: string,
    query: ListFuelLogsQueryDto,
  ): Promise<FuelLogListResponseDto> {
    const { page, limit, from, to } = query;
    if (from !== undefined && to !== undefined && from > to) {
      throw new BadRequestException('from must not be after to');
    }
    await this.assertVehicleExists(organizationId, vehicleId);
    const where: Prisma.FuelLogWhereInput = {
      organizationId,
      vehicleId,
      ...((from !== undefined || to !== undefined) && {
        fueledOn: {
          ...(from !== undefined && { gte: parseDateOnly(from) }),
          ...(to !== undefined && { lte: parseDateOnly(to) }),
        },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fuelLog.findMany({
        where,
        select: FUEL_LOG_SELECT,
        orderBy: [{ fueledOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fuelLog.count({ where }),
    ]);
    return { data: rows.map(toFuelLogResponse), meta: { page, limit, total } };
  }

  async findOne(
    organizationId: string,
    vehicleId: string,
    id: string,
  ): Promise<FuelLogResponseDto> {
    const row = await this.prisma.fuelLog.findFirst({
      where: { id, vehicleId, organizationId },
      select: FUEL_LOG_SELECT,
    });
    if (!row) throw new NotFoundException(FUEL_LOG_NOT_FOUND);
    return toFuelLogResponse(row);
  }

  async create(
    organizationId: string,
    vehicleId: string,
    dto: CreateFuelLogDto,
  ): Promise<FuelLogResponseDto> {
    await this.assertVehicleExists(organizationId, vehicleId);
    const row = await this.prisma.fuelLog.create({
      data: {
        organizationId,
        vehicleId,
        fueledOn: parseDateOnly(dto.fueledOn),
        liters: dto.liters,
        totalCost: dto.totalCost,
        odometerKm: dto.odometerKm ?? null,
      },
      select: FUEL_LOG_SELECT,
    });
    return toFuelLogResponse(row);
  }

  async update(
    organizationId: string,
    vehicleId: string,
    id: string,
    dto: UpdateFuelLogDto,
  ): Promise<FuelLogResponseDto> {
    try {
      // undefined = unchanged, null (odometerKm only) = clear.
      const row = await this.prisma.fuelLog.update({
        where: { id, vehicleId, organizationId },
        data: {
          fueledOn:
            dto.fueledOn === undefined
              ? undefined
              : parseDateOnly(dto.fueledOn),
          liters: dto.liters,
          totalCost: dto.totalCost,
          odometerKm: dto.odometerKm,
        },
        select: FUEL_LOG_SELECT,
      });
      return toFuelLogResponse(row);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async remove(
    organizationId: string,
    vehicleId: string,
    id: string,
  ): Promise<void> {
    try {
      await this.prisma.fuelLog.delete({
        where: { id, vehicleId, organizationId },
        select: { id: true },
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  private async assertVehicleExists(
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException(VEHICLE_NOT_FOUND);
  }
}
