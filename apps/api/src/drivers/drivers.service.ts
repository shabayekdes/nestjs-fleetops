import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseDateOnly, toDateOnly } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { uniqueConstraintHints } from '../database/prisma-errors.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  computeLicenseStatus,
  licenseExpiresOnFilter,
} from './driver-license.js';
import type { CreateDriverDto } from './dto/create-driver.dto.js';
import type {
  DriverListResponseDto,
  DriverResponseDto,
} from './dto/driver-response.dto.js';
import type { ListDriversQueryDto } from './dto/list-drivers-query.dto.js';
import type { UpdateDriverDto } from './dto/update-driver.dto.js';

const DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  licenseNumber: true,
  licenseExpiresOn: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DriverSelect;

type DriverRow = Prisma.DriverGetPayload<{ select: typeof DRIVER_SELECT }>;

const toDriverResponse = (
  row: DriverRow,
  now: Date = new Date(),
): DriverResponseDto => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  licenseNumber: row.licenseNumber,
  licenseExpiresOn: toDateOnly(row.licenseExpiresOn),
  licenseStatus: computeLicenseStatus(row.licenseExpiresOn, now),
  userId: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Maps known Prisma errors to HTTP exceptions; anything else is returned unchanged. */
function toHttpError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
  if (error.code === 'P2025') return new NotFoundException('Driver not found');
  if (error.code !== 'P2002') return error;
  const hints = uniqueConstraintHints(error.meta);
  if (hints.some((h) => h === 'userId' || h.includes('user_id'))) {
    return new ConflictException('This user is already linked to a driver');
  }
  if (
    hints.some((h) => h === 'licenseNumber' || h.includes('license_number'))
  ) {
    return new ConflictException(
      'A driver with this license number already exists',
    );
  }
  return error;
}

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: ListDriversQueryDto,
  ): Promise<DriverListResponseDto> {
    const { page, limit, licenseStatus } = query;
    const now = new Date();
    const where: Prisma.DriverWhereInput = {
      organizationId,
      ...(licenseStatus !== undefined && {
        licenseExpiresOn: licenseExpiresOnFilter(licenseStatus, now),
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        select: DRIVER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.driver.count({ where }),
    ]);
    return {
      data: rows.map((row) => toDriverResponse(row, now)),
      meta: { page, limit, total },
    };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<DriverResponseDto> {
    const driver = await this.prisma.driver.findFirst({
      where: { id, organizationId },
      select: DRIVER_SELECT,
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return toDriverResponse(driver);
  }

  async create(
    organizationId: string,
    dto: CreateDriverDto,
  ): Promise<DriverResponseDto> {
    await this.assertUserInOrganization(organizationId, dto.userId);
    try {
      const driver = await this.prisma.driver.create({
        data: {
          organizationId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          licenseNumber: dto.licenseNumber,
          licenseExpiresOn: parseDateOnly(dto.licenseExpiresOn),
          userId: dto.userId ?? null,
        },
        select: DRIVER_SELECT,
      });
      return toDriverResponse(driver);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateDriverDto,
  ): Promise<DriverResponseDto> {
    await this.assertUserInOrganization(organizationId, dto.userId);
    try {
      // undefined = unchanged, null (userId only) = unlink.
      const driver = await this.prisma.driver.update({
        where: { id, organizationId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          licenseNumber: dto.licenseNumber,
          licenseExpiresOn:
            dto.licenseExpiresOn === undefined
              ? undefined
              : parseDateOnly(dto.licenseExpiresOn),
          userId: dto.userId,
        },
        select: DRIVER_SELECT,
      });
      return toDriverResponse(driver);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    try {
      await this.prisma.driver.delete({
        where: { id, organizationId },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Driver has assignments and cannot be deleted',
        );
      }
      throw toHttpError(error);
    }
  }

  private async assertUserInOrganization(
    organizationId: string,
    userId: string | null | undefined,
  ): Promise<void> {
    if (typeof userId !== 'string') return;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
  }
}
