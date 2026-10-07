import { ApiProperty } from '@nestjs/swagger';
import { LicenseStatus } from '../driver-license.js';

export class DriverResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  /** "YYYY-MM-DD" */
  licenseExpiresOn: string;
  /** Derived from `licenseExpiresOn` (UTC): EXPIRING_SOON means within 30 days. */
  @ApiProperty({ enum: Object.values(LicenseStatus) })
  licenseStatus: LicenseStatus;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DriverListResponseDto {
  data: DriverResponseDto[];
  meta: { page: number; limit: number; total: number };
}
