import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDaysUtc, todayUtc } from '../common/date-only.js';
import { PrismaService } from '../database/prisma.service.js';
import { ServiceStatus } from '../generated/prisma/client.js';
import { SERVICE_DUE_SOON_DAYS } from './service-status.js';

export const SERVICE_STATUS_LOCK_KEY = 'fleetops:service-status-refresh';

export interface ServiceStatusRefreshResult {
  overdue: number;
  dueSoon: number;
  ok: number;
  unknown: number;
}

@Injectable()
export class ServiceStatusJob {
  private readonly logger = new Logger(ServiceStatusJob.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Advances Vehicle.serviceStatus as time passes (a due date does not change
   * when its status does). Runs daily at 02:00 UTC. Idempotent.
   *
   * This is the ONLY cross-tenant query in the codebase, deliberately: it is a
   * system job that writes only the derived `serviceStatus` column (and `updatedAt`), from each
   * row's own `nextServiceDueOn`, and never reads or returns tenant data.
   */
  @Cron('0 2 * * *', { name: 'service-status-refresh', timeZone: 'UTC' })
  async refreshServiceStatuses(): Promise<ServiceStatusRefreshResult | null> {
    const today = todayUtc();
    const soonEnd = addDaysUtc(today, SERVICE_DUE_SOON_DAYS);
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Transaction-scoped lock: released at commit/rollback, so several
        // instances never run the job concurrently.
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtext(${SERVICE_STATUS_LOCK_KEY})) AS locked`;
        if (!lock?.locked) return null;

        const overdue = await tx.vehicle.updateMany({
          where: {
            nextServiceDueOn: { lt: today },
            serviceStatus: { not: ServiceStatus.OVERDUE },
          },
          data: { serviceStatus: ServiceStatus.OVERDUE },
        });
        const dueSoon = await tx.vehicle.updateMany({
          where: {
            nextServiceDueOn: { gte: today, lte: soonEnd },
            serviceStatus: { not: ServiceStatus.DUE_SOON },
          },
          data: { serviceStatus: ServiceStatus.DUE_SOON },
        });
        const ok = await tx.vehicle.updateMany({
          where: {
            nextServiceDueOn: { gt: soonEnd },
            serviceStatus: { not: ServiceStatus.OK },
          },
          data: { serviceStatus: ServiceStatus.OK },
        });
        const unknown = await tx.vehicle.updateMany({
          where: {
            nextServiceDueOn: null,
            serviceStatus: { not: ServiceStatus.UNKNOWN },
          },
          data: { serviceStatus: ServiceStatus.UNKNOWN },
        });
        return {
          overdue: overdue.count,
          dueSoon: dueSoon.count,
          ok: ok.count,
          unknown: unknown.count,
        };
      },
      { timeout: 60_000 },
    );
    if (!result) {
      this.logger.log(
        'Service status refresh skipped: already running on another instance',
      );
      return null;
    }
    this.logger.log(
      `Service status refresh: overdue=${result.overdue} dueSoon=${result.dueSoon} ok=${result.ok} unknown=${result.unknown}`,
    );
    return result;
  }
}
