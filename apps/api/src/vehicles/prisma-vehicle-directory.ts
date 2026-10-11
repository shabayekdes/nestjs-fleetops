import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { VehicleDirectory } from '../telemetry/vehicle-directory.port.js';

/** Adapter that lets the optional telemetry module check vehicle ownership. */
@Injectable()
export class PrismaVehicleDirectory implements VehicleDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async existingVehicleIds(
    organizationId: string,
    vehicleIds: readonly string[],
  ): Promise<Set<string>> {
    const distinct = [...new Set(vehicleIds)];
    if (distinct.length === 0) return new Set();
    const rows = await this.prisma.vehicle.findMany({
      where: { organizationId, id: { in: distinct } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
