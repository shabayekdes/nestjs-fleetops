import type { MaintenanceType } from '../../generated/prisma/client.js';

export class MaintenanceRecordResponseDto {
  id: string;
  vehicleId: string;
  type: MaintenanceType;
  description: string | null;
  vendor: string | null;
  /** "YYYY-MM-DD" */
  performedOn: string;
  odometerKm: number | null;
  /** Fixed-scale decimal string, 2 decimal places. */
  cost: string;
  /** "YYYY-MM-DD" */
  nextServiceDueOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MaintenanceRecordListResponseDto {
  data: MaintenanceRecordResponseDto[];
  meta: { page: number; limit: number; total: number };
}
