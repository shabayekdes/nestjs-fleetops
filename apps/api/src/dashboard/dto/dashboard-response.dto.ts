import { ApiProperty } from '@nestjs/swagger';
import type { LicenseStatus } from '../../drivers/driver-license.js';

export class FleetServiceStatusCountsDto {
  OK: number;
  DUE_SOON: number;
  OVERDUE: number;
  UNKNOWN: number;
}

export class FleetLicenseStatusCountsDto {
  VALID: number;
  EXPIRING_SOON: number;
  EXPIRED: number;
}

export class FleetVehiclesDto {
  total: number;
  serviceStatus: FleetServiceStatusCountsDto;
}

export class FleetDriversDto {
  total: number;
  licenseStatus: FleetLicenseStatusCountsDto;
}

export class FleetAssignmentsDto {
  /** Assignments that have not ended. */
  active: number;
}

export class FleetDashboardResponseDto {
  /** "YYYY-MM-DD": the UTC day used for the license windows. */
  asOf: string;
  vehicles: FleetVehiclesDto;
  drivers: FleetDriversDto;
  assignments: FleetAssignmentsDto;
}

export class DashboardDriverDto {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  /** "YYYY-MM-DD" */
  licenseExpiresOn: string;
  @ApiProperty({ enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED'] })
  licenseStatus: LicenseStatus;
}

export class DashboardVehicleDto {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
}

export class DashboardAssignmentDto {
  id: string;
  startedAt: Date;
  vehicle: DashboardVehicleDto;
}

export class MyDashboardResponseDto {
  /** The driver profile linked to the caller, or null. */
  @ApiProperty({ type: DashboardDriverDto, nullable: true })
  driver: DashboardDriverDto | null;
  /** The caller's active assignment, or null. */
  @ApiProperty({ type: DashboardAssignmentDto, nullable: true })
  currentAssignment: DashboardAssignmentDto | null;
}
