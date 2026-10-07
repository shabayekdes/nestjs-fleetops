import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { toDateOnly, todayUtc } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  computeLicenseStatus,
  LicenseStatus,
  licenseExpiresOnFilter,
} from '../drivers/driver-license.js';
import { ServiceStatus } from '../generated/prisma/client.js';
import type {
  FleetDashboardResponseDto,
  MyDashboardResponseDto,
} from './dto/dashboard-response.dto.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getFleet(organizationId: string): Promise<FleetDashboardResponseDto> {
    const now = new Date();
    const [byStatus, drivers, expired, expiringSoon, active] =
      await this.prisma.$transaction([
        this.prisma.vehicle.groupBy({
          by: ['serviceStatus'],
          where: { organizationId },
          _count: { _all: true },
        }),
        this.prisma.driver.count({ where: { organizationId } }),
        this.prisma.driver.count({
          where: {
            organizationId,
            licenseExpiresOn: licenseExpiresOnFilter(
              LicenseStatus.EXPIRED,
              now,
            ),
          },
        }),
        this.prisma.driver.count({
          where: {
            organizationId,
            licenseExpiresOn: licenseExpiresOnFilter(
              LicenseStatus.EXPIRING_SOON,
              now,
            ),
          },
        }),
        this.prisma.vehicleAssignment.count({
          where: { organizationId, endedAt: null },
        }),
      ]);

    const serviceStatus = {
      [ServiceStatus.OK]: 0,
      [ServiceStatus.DUE_SOON]: 0,
      [ServiceStatus.OVERDUE]: 0,
      [ServiceStatus.UNKNOWN]: 0,
    };
    for (const row of byStatus) {
      serviceStatus[row.serviceStatus] = row._count._all;
    }
    const vehicleTotal = Object.values(serviceStatus).reduce(
      (sum, n) => sum + n,
      0,
    );

    return {
      asOf: toDateOnly(todayUtc(now)),
      vehicles: { total: vehicleTotal, serviceStatus },
      drivers: {
        total: drivers,
        licenseStatus: {
          VALID: drivers - expired - expiringSoon,
          EXPIRING_SOON: expiringSoon,
          EXPIRED: expired,
        },
      },
      assignments: { active },
    };
  }

  async getMe(user: AuthUser): Promise<MyDashboardResponseDto> {
    const { organizationId, userId } = user;
    const row = await this.prisma.driver.findFirst({
      where: { userId, organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
        licenseExpiresOn: true,
        assignments: {
          where: { organizationId, endedAt: null },
          take: 1,
          select: {
            id: true,
            startedAt: true,
            vehicle: {
              select: { id: true, make: true, model: true, licensePlate: true },
            },
          },
        },
      },
    });
    if (!row) return { driver: null, currentAssignment: null };

    const { assignments, ...driver } = row;
    return {
      driver: {
        ...driver,
        licenseExpiresOn: toDateOnly(driver.licenseExpiresOn),
        licenseStatus: computeLicenseStatus(driver.licenseExpiresOn),
      },
      currentAssignment: assignments[0] ?? null,
    };
  }
}
