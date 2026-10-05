import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseDateOnly, toDateOnly } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CostSummaryQueryDto } from './dto/cost-summary-query.dto.js';
import type { CostSummaryResponseDto } from './dto/cost-summary-response.dto.js';
import {
  addMonths,
  countMonths,
  currentMonth,
  enumerateMonths,
} from './month-range.js';

const MAX_MONTHS = 24;
const DEFAULT_MONTHS = 12;

interface MonthTotals {
  maintenanceCost: Prisma.Decimal;
  fuelCost: Prisma.Decimal;
  fuelLiters: Prisma.Decimal;
}

const zero = (): MonthTotals => ({
  maintenanceCost: new Prisma.Decimal(0),
  fuelCost: new Prisma.Decimal(0),
  fuelLiters: new Prisma.Decimal(0),
});

const format = (t: MonthTotals) => ({
  maintenanceCost: t.maintenanceCost.toFixed(2),
  fuelCost: t.fuelCost.toFixed(2),
  fuelLiters: t.fuelLiters.toFixed(3),
  totalCost: t.maintenanceCost.plus(t.fuelCost).toFixed(2),
});

@Injectable()
export class CostSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    organizationId: string,
    vehicleId: string,
    query: CostSummaryQueryDto,
  ): Promise<CostSummaryResponseDto> {
    const to = query.to ?? currentMonth();
    const from = query.from ?? addMonths(to, -(DEFAULT_MONTHS - 1));
    if (from > to) throw new BadRequestException('from must not be after to');
    if (countMonths(from, to) > MAX_MONTHS) {
      throw new BadRequestException(
        `The range must not exceed ${MAX_MONTHS} months`,
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const range = {
      gte: parseDateOnly(`${from}-01`),
      lt: parseDateOnly(`${addMonths(to, 1)}-01`),
    };
    const [maintenance, fuel] = await this.prisma.$transaction([
      this.prisma.maintenanceRecord.groupBy({
        by: ['performedOn'],
        where: { organizationId, vehicleId, performedOn: range },
        _sum: { cost: true },
      }),
      this.prisma.fuelLog.groupBy({
        by: ['fueledOn'],
        where: { organizationId, vehicleId, fueledOn: range },
        _sum: { totalCost: true, liters: true },
      }),
    ]);

    const buckets = new Map<string, MonthTotals>(
      enumerateMonths(from, to).map((m) => [m, zero()]),
    );
    for (const row of maintenance) {
      const bucket = buckets.get(toDateOnly(row.performedOn).slice(0, 7));
      if (bucket && row._sum.cost) {
        bucket.maintenanceCost = bucket.maintenanceCost.plus(row._sum.cost);
      }
    }
    for (const row of fuel) {
      const bucket = buckets.get(toDateOnly(row.fueledOn).slice(0, 7));
      if (!bucket) continue;
      if (row._sum.totalCost) {
        bucket.fuelCost = bucket.fuelCost.plus(row._sum.totalCost);
      }
      if (row._sum.liters) {
        bucket.fuelLiters = bucket.fuelLiters.plus(row._sum.liters);
      }
    }

    const totals = zero();
    const months = [...buckets].map(([month, t]) => {
      totals.maintenanceCost = totals.maintenanceCost.plus(t.maintenanceCost);
      totals.fuelCost = totals.fuelCost.plus(t.fuelCost);
      totals.fuelLiters = totals.fuelLiters.plus(t.fuelLiters);
      return { month, ...format(t) };
    });
    return { from, to, months, totals: format(totals) };
  }
}
