import { toDateOnly } from '../../common/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MaintenanceRecordResponseDto } from './maintenance-record-response.dto.js';

export const MAINTENANCE_SELECT = {
  id: true,
  vehicleId: true,
  type: true,
  description: true,
  vendor: true,
  performedOn: true,
  odometerKm: true,
  cost: true,
  nextServiceDueOn: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MaintenanceRecordSelect;

export type MaintenanceRow = Prisma.MaintenanceRecordGetPayload<{
  select: typeof MAINTENANCE_SELECT;
}>;

export const toMaintenanceResponse = (
  row: MaintenanceRow,
): MaintenanceRecordResponseDto => ({
  id: row.id,
  vehicleId: row.vehicleId,
  type: row.type,
  description: row.description,
  vendor: row.vendor,
  performedOn: toDateOnly(row.performedOn),
  odometerKm: row.odometerKm,
  cost: row.cost.toFixed(2),
  nextServiceDueOn:
    row.nextServiceDueOn === null ? null : toDateOnly(row.nextServiceDueOn),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
