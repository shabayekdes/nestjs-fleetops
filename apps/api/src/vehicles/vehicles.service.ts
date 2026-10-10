import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
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
  vehicleMake: { select: { id: true, name: true } },
  vehicleModel: { select: { id: true, name: true } },
  vehicleType: { select: { id: true, name: true } },
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
  make: row.vehicleMake,
  model: row.vehicleModel,
  vehicleType: row.vehicleType,
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
  if (error.code === 'P2003') {
    return new UnprocessableEntityException(
      'Vehicle make, model or type is not valid',
    );
  }
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
    const { page, limit, makeId, modelId, vehicleTypeId, year, serviceStatus } =
      query;
    const where: Prisma.VehicleWhereInput = {
      organizationId,
      ...(makeId !== undefined && { makeId }),
      ...(modelId !== undefined && { modelId }),
      ...(vehicleTypeId !== undefined && { vehicleTypeId }),
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
    await this.assertCatalogRefs(
      {
        makeId: dto.makeId,
        modelId: dto.modelId,
        vehicleTypeId: dto.vehicleTypeId,
      },
      null,
    );
    try {
      const vehicle = await this.prisma.vehicle.create({
        data: {
          organizationId,
          makeId: dto.makeId,
          modelId: dto.modelId,
          vehicleTypeId: dto.vehicleTypeId,
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
    if (
      dto.makeId !== undefined ||
      dto.modelId !== undefined ||
      dto.vehicleTypeId !== undefined
    ) {
      const current = await this.prisma.vehicle.findFirst({
        where: { id, organizationId },
        select: { makeId: true, modelId: true, vehicleTypeId: true },
      });
      if (!current) throw new NotFoundException('Vehicle not found');
      await this.assertCatalogRefs(
        {
          makeId: dto.makeId ?? current.makeId,
          modelId: dto.modelId ?? current.modelId,
          vehicleTypeId: dto.vehicleTypeId ?? current.vehicleTypeId,
        },
        current,
      );
    }
    try {
      // undefined = unchanged, null (licensePlate only) = clear.
      const vehicle = await this.prisma.vehicle.update({
        where: { id, organizationId },
        data: {
          makeId: dto.makeId,
          modelId: dto.modelId,
          vehicleTypeId: dto.vehicleTypeId,
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

  /**
   * Validates the catalog references of a create or update. Values are checked
   * only when newly used (`current` null = create): an unchanged retired make,
   * model or type passes. Throws 422 in a fixed order.
   */
  private async assertCatalogRefs(
    refs: { makeId: string; modelId: string; vehicleTypeId: string },
    current: { makeId: string; modelId: string; vehicleTypeId: string } | null,
  ): Promise<void> {
    const pairChanged =
      current === null ||
      refs.makeId !== current.makeId ||
      refs.modelId !== current.modelId;
    if (pairChanged) {
      const make = await this.prisma.vehicleMake.findUnique({
        where: { id: refs.makeId },
        select: { active: true },
      });
      if (!make)
        throw new UnprocessableEntityException('Vehicle make not found');
      if (!make.active) {
        throw new UnprocessableEntityException('Vehicle make is retired');
      }
      const model = await this.prisma.vehicleModel.findUnique({
        where: { makeId_id: { makeId: refs.makeId, id: refs.modelId } },
        select: { active: true },
      });
      if (!model) {
        throw new UnprocessableEntityException(
          'Vehicle model not found for this make',
        );
      }
      if (!model.active) {
        throw new UnprocessableEntityException('Vehicle model is retired');
      }
    }
    if (current === null || refs.vehicleTypeId !== current.vehicleTypeId) {
      const type = await this.prisma.vehicleType.findUnique({
        where: { id: refs.vehicleTypeId },
        select: { active: true },
      });
      if (!type)
        throw new UnprocessableEntityException('Vehicle type not found');
      if (!type.active) {
        throw new UnprocessableEntityException('Vehicle type is retired');
      }
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
