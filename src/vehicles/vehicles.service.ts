import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Constraint names / field names reported for a unique violation.
 * adapter-pg puts them in meta.driverAdapterError.cause.constraint.{index|fields};
 * meta.target is kept for non-adapter engines.
 */
function uniqueConstraintHints(
  meta: Record<string, unknown> | undefined,
): string[] {
  const hints: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value === 'string') {
      hints.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') hints.push(item);
      }
    }
  };
  add(meta?.target);
  const adapterError = meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  if (isRecord(constraint)) {
    add(constraint.index);
    add(constraint.fields);
  }
  return hints;
}

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
    const { page, limit, make, model, year } = query;
    const where: Prisma.VehicleWhereInput = {
      organizationId,
      ...(make !== undefined && {
        make: { equals: make, mode: 'insensitive' },
      }),
      ...(model !== undefined && {
        model: { equals: model, mode: 'insensitive' },
      }),
      ...(year !== undefined && { year }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        select: VEHICLE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
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
    return vehicle;
  }

  async create(
    organizationId: string,
    dto: CreateVehicleDto,
  ): Promise<VehicleResponseDto> {
    try {
      return await this.prisma.vehicle.create({
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
      return await this.prisma.vehicle.update({
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
      throw toHttpError(error);
    }
  }
}
