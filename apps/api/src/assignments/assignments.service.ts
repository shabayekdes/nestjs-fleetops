import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { uniqueConstraintHints } from '../database/prisma-errors.js';
import { isLicenseExpired } from '../drivers/driver-license.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  AssignmentListResponseDto,
  AssignmentResponseDto,
} from './dto/assignment-response.dto.js';
import type { CreateAssignmentDto } from './dto/create-assignment.dto.js';
import type { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto.js';

const ASSIGNMENT_SELECT = {
  id: true,
  startedAt: true,
  endedAt: true,
  vehicle: {
    select: {
      id: true,
      vin: true,
      licensePlate: true,
      vehicleMake: { select: { name: true } },
      vehicleModel: { select: { name: true } },
    },
  },
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      licenseNumber: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleAssignmentSelect;

type AssignmentRow = Prisma.VehicleAssignmentGetPayload<{
  select: typeof ASSIGNMENT_SELECT;
}>;

/** Flattens the catalog relations back to the `make` / `model` name strings. */
const toAssignmentResponse = ({
  vehicle: { vehicleMake, vehicleModel, ...vehicle },
  ...row
}: AssignmentRow): AssignmentResponseDto => ({
  ...row,
  vehicle: { ...vehicle, make: vehicleMake.name, model: vehicleModel.name },
});

const ACTIVE_VEHICLE_INDEX = 'vehicle_assignments_active_vehicle_key';
const ACTIVE_DRIVER_INDEX = 'vehicle_assignments_active_driver_key';
const VEHICLE_BUSY = 'Vehicle already has an active assignment';
const DRIVER_BUSY = 'Driver already has an active assignment';

/** Maps a race-lost partial unique index violation to the same 409 as the pre-checks. */
function toHttpError(error: unknown): unknown {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return error;
  }
  const hints = uniqueConstraintHints(error.meta);
  if (hints.includes(ACTIVE_VEHICLE_INDEX)) {
    return new ConflictException(VEHICLE_BUSY);
  }
  if (hints.includes(ACTIVE_DRIVER_INDEX)) {
    return new ConflictException(DRIVER_BUSY);
  }
  return error;
}

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: ListAssignmentsQueryDto,
  ): Promise<AssignmentListResponseDto> {
    const { page, limit, vehicleId, driverId, active } = query;
    const where: Prisma.VehicleAssignmentWhereInput = {
      organizationId,
      ...(vehicleId !== undefined && { vehicleId }),
      ...(driverId !== undefined && { driverId }),
      ...(active === true && { endedAt: null }),
      ...(active === false && { endedAt: { not: null } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicleAssignment.findMany({
        where,
        select: ASSIGNMENT_SELECT,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicleAssignment.count({ where }),
    ]);
    return {
      data: data.map(toAssignmentResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<AssignmentResponseDto> {
    const assignment = await this.prisma.vehicleAssignment.findFirst({
      where: { id, organizationId },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return toAssignmentResponse(assignment);
  }

  async create(
    organizationId: string,
    dto: CreateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: dto.vehicleId, organizationId },
          select: { id: true },
        });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const driver = await tx.driver.findFirst({
          where: { id: dto.driverId, organizationId },
          select: { id: true, licenseExpiresOn: true },
        });
        if (!driver) throw new NotFoundException('Driver not found');

        if (isLicenseExpired(driver.licenseExpiresOn)) {
          throw new UnprocessableEntityException('Driver license has expired');
        }

        const vehicleBusy = await tx.vehicleAssignment.findFirst({
          where: { organizationId, vehicleId: vehicle.id, endedAt: null },
          select: { id: true },
        });
        if (vehicleBusy) throw new ConflictException(VEHICLE_BUSY);

        const driverBusy = await tx.vehicleAssignment.findFirst({
          where: { organizationId, driverId: driver.id, endedAt: null },
          select: { id: true },
        });
        if (driverBusy) throw new ConflictException(DRIVER_BUSY);

        const created = await tx.vehicleAssignment.create({
          data: {
            organizationId,
            vehicleId: vehicle.id,
            driverId: driver.id,
            startedAt: new Date(),
          },
          select: ASSIGNMENT_SELECT,
        });
        return toAssignmentResponse(created);
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async end(
    organizationId: string,
    id: string,
  ): Promise<AssignmentResponseDto> {
    const { count } = await this.prisma.vehicleAssignment.updateMany({
      where: { id, organizationId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (count === 0) {
      const existing = await this.prisma.vehicleAssignment.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Assignment not found');
      throw new ConflictException('Assignment has already ended');
    }
    return this.findOne(organizationId, id);
  }
}
