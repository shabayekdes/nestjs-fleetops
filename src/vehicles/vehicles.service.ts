import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toDateOnly } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { uniqueConstraintHints } from '../database/prisma-errors.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import type {
  VehicleListResponseDto,
  VehicleResponseDto,
} from './dto/vehicle-response.dto.js';

const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  vin: true,
  licensePlate: true,
  nextServiceDueOn: true,
  serviceStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;

const toVehicleResponse = (row: VehicleRow): VehicleResponseDto => ({
  id: row.id,
  make: row.make,
  model: row.model,
  year: row.year,
  vin: row.vin,
  licensePlate: row.licensePlate,
  nextServiceDueOn: row.nextServiceDueOn
    ? toDateOnly(row.nextServiceDueOn)
    : null,
  serviceStatus: row.serviceStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Maps known Prisma errors to HTTP exceptions; anything else is returned unchanged. */
function toHttpError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
  if (error.code === 'P2025') return new NotFoundException('Vehicle not found');
  if (error.code !== 'P2002') return error;
  const hints = uniqueConstraintHints(error.meta);
  if (hints.some((h) => h === 'licensePlate' || h.includes('license_plate'))) {
    return new ConflictException(
      'A vehicle with this license plate already exists',
    );
  }
  if (hints.some((h) => h === 'vin' || /(^|_)vin(_|$)/.test(h))) {
    return new ConflictException('A vehicle with this VIN already exists');
  }
  return new ConflictException(
    'A vehicle with this VIN or license plate already exists',
  );
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: ListVehiclesQueryDto,
  ): Promise<VehicleListResponseDto> {
    const { page, limit, make, model, year, serviceStatus } = query;
    const where: Prisma.VehicleWhereInput = {
      organizationId,
      ...(make !== undefined && {
        make: { equals: make, mode: 'insensitive' },
      }),
      ...(model !== undefined && {
        model: { equals: model, mode: 'insensitive' },
      }),
      ...(year !== undefined && { year }),
      ...(serviceStatus !== undefined && { serviceStatus }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        select: VEHICLE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { data: rows.map(toVehicleResponse), meta: { page, limit, total } };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, organizationId },
      select: VEHICLE_SELECT,
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return toVehicleResponse(vehicle);
  }

  async create(
    organizationId: string,
    dto: CreateVehicleDto,
  ): Promise<VehicleResponseDto> {
    try {
      const vehicle = await this.prisma.vehicle.create({
        data: {
          organizationId,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          vin: dto.vin,
          licensePlate: dto.licensePlate ?? null,
        },
        select: VEHICLE_SELECT,
      });
      return toVehicleResponse(vehicle);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    try {
      // undefined = unchanged, null (licensePlate only) = clear.
      const vehicle = await this.prisma.vehicle.update({
        where: { id, organizationId },
        data: {
          make: dto.make,
          model: dto.model,
          year: dto.year,
          vin: dto.vin,
          licensePlate: dto.licensePlate,
        },
        select: VEHICLE_SELECT,
      });
      return toVehicleResponse(vehicle);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    try {
      await this.prisma.vehicle.delete({
        where: { id, organizationId },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Vehicle has related records and cannot be deleted',
        );
      }
      throw toHttpError(error);
    }
  }
}
