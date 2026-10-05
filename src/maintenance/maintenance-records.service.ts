import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseDateOnly, toDateOnly } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateMaintenanceRecordDto } from './dto/create-maintenance-record.dto.js';
import type { ListMaintenanceRecordsQueryDto } from './dto/list-maintenance-records-query.dto.js';
import {
  MAINTENANCE_SELECT,
  toMaintenanceResponse,
} from './dto/maintenance-mappers.js';
import type {
  MaintenanceRecordListResponseDto,
  MaintenanceRecordResponseDto,
} from './dto/maintenance-record-response.dto.js';
import type { UpdateMaintenanceRecordDto } from './dto/update-maintenance-record.dto.js';
import { computeServiceStatus } from './service-status.js';

const VEHICLE_NOT_FOUND = 'Vehicle not found';
const RECORD_NOT_FOUND = 'Maintenance record not found';
const DUE_AFTER_PERFORMED = 'nextServiceDueOn must be after performedOn';

/** Maps known Prisma errors to HTTP exceptions; anything else is returned unchanged. */
function toHttpError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    return new NotFoundException(RECORD_NOT_FOUND);
  }
  return error;
}

@Injectable()
export class MaintenanceRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    vehicleId: string,
    query: ListMaintenanceRecordsQueryDto,
  ): Promise<MaintenanceRecordListResponseDto> {
    const { page, limit, type, from, to } = query;
    if (from !== undefined && to !== undefined && from > to) {
      throw new BadRequestException('from must not be after to');
    }
    await this.assertVehicleExists(organizationId, vehicleId);
    const where: Prisma.MaintenanceRecordWhereInput = {
      organizationId,
      vehicleId,
      ...(type !== undefined && { type }),
      ...((from !== undefined || to !== undefined) && {
        performedOn: {
          ...(from !== undefined && { gte: parseDateOnly(from) }),
          ...(to !== undefined && { lte: parseDateOnly(to) }),
        },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRecord.findMany({
        where,
        select: MAINTENANCE_SELECT,
        orderBy: [
          { performedOn: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.maintenanceRecord.count({ where }),
    ]);
    return {
      data: rows.map(toMaintenanceResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(
    organizationId: string,
    vehicleId: string,
    id: string,
  ): Promise<MaintenanceRecordResponseDto> {
    const row = await this.prisma.maintenanceRecord.findFirst({
      where: { id, vehicleId, organizationId },
      select: MAINTENANCE_SELECT,
    });
    if (!row) throw new NotFoundException(RECORD_NOT_FOUND);
    return toMaintenanceResponse(row);
  }

  async create(
    organizationId: string,
    vehicleId: string,
    dto: CreateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordResponseDto> {
    this.assertDueAfterPerformed(dto.performedOn, dto.nextServiceDueOn);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockVehicle(
          tx,
          organizationId,
          vehicleId,
          VEHICLE_NOT_FOUND,
        );
        const created = await tx.maintenanceRecord.create({
          data: {
            organizationId,
            vehicleId,
            type: dto.type,
            description: dto.description ?? null,
            vendor: dto.vendor ?? null,
            performedOn: parseDateOnly(dto.performedOn),
            odometerKm: dto.odometerKm ?? null,
            cost: dto.cost,
            nextServiceDueOn:
              dto.nextServiceDueOn === undefined
                ? null
                : parseDateOnly(dto.nextServiceDueOn),
          },
          select: MAINTENANCE_SELECT,
        });
        await this.refreshVehicleService(tx, organizationId, vehicleId);
        return created;
      });
      return toMaintenanceResponse(row);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async update(
    organizationId: string,
    vehicleId: string,
    id: string,
    dto: UpdateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordResponseDto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockVehicle(tx, organizationId, vehicleId, RECORD_NOT_FOUND);
        const existing = await tx.maintenanceRecord.findFirst({
          where: { id, vehicleId, organizationId },
          select: { performedOn: true, nextServiceDueOn: true },
        });
        if (!existing) throw new NotFoundException(RECORD_NOT_FOUND);

        // Cross-field rule on the merged values.
        const performedOn = dto.performedOn ?? toDateOnly(existing.performedOn);
        const nextServiceDueOn =
          dto.nextServiceDueOn === undefined
            ? existing.nextServiceDueOn === null
              ? null
              : toDateOnly(existing.nextServiceDueOn)
            : dto.nextServiceDueOn;
        this.assertDueAfterPerformed(performedOn, nextServiceDueOn);

        // undefined = unchanged, null = clear (nullable columns only).
        const updated = await tx.maintenanceRecord.update({
          where: { id, vehicleId, organizationId },
          data: {
            type: dto.type,
            description: dto.description,
            vendor: dto.vendor,
            performedOn:
              dto.performedOn === undefined
                ? undefined
                : parseDateOnly(dto.performedOn),
            odometerKm: dto.odometerKm,
            cost: dto.cost,
            nextServiceDueOn:
              dto.nextServiceDueOn === undefined ||
              dto.nextServiceDueOn === null
                ? dto.nextServiceDueOn
                : parseDateOnly(dto.nextServiceDueOn),
          },
          select: MAINTENANCE_SELECT,
        });
        await this.refreshVehicleService(tx, organizationId, vehicleId);
        return updated;
      });
      return toMaintenanceResponse(row);
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
      await this.prisma.$transaction(async (tx) => {
        await this.lockVehicle(tx, organizationId, vehicleId, RECORD_NOT_FOUND);
        await tx.maintenanceRecord.delete({
          where: { id, vehicleId, organizationId },
          select: { id: true },
        });
        await this.refreshVehicleService(tx, organizationId, vehicleId);
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

  private assertDueAfterPerformed(
    performedOn: string,
    nextServiceDueOn: string | null | undefined,
  ): void {
    if (
      nextServiceDueOn !== undefined &&
      nextServiceDueOn !== null &&
      nextServiceDueOn <= performedOn
    ) {
      throw new BadRequestException(DUE_AFTER_PERFORMED);
    }
  }

  /**
   * Locks the vehicle row so concurrent maintenance writes for one vehicle are
   * serialized and the derived service fields cannot be recomputed from a
   * stale view. Tagged template only: values are always bound parameters.
   */
  private async lockVehicle(
    tx: Prisma.TransactionClient,
    organizationId: string,
    vehicleId: string,
    notFoundMessage: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM vehicles
      WHERE id = ${vehicleId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(notFoundMessage);
  }

  /**
   * Vehicle.nextServiceDueOn = due date of the latest record that has one
   * (performedOn, then createdAt, then id, all descending).
   */
  private async refreshVehicleService(
    tx: Prisma.TransactionClient,
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const latest = await tx.maintenanceRecord.findFirst({
      where: { organizationId, vehicleId, nextServiceDueOn: { not: null } },
      orderBy: [{ performedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { nextServiceDueOn: true },
    });
    const nextServiceDueOn = latest?.nextServiceDueOn ?? null;
    await tx.vehicle.update({
      where: { id: vehicleId, organizationId },
      data: {
        nextServiceDueOn,
        serviceStatus: computeServiceStatus(nextServiceDueOn),
      },
      select: { id: true },
    });
  }
}
