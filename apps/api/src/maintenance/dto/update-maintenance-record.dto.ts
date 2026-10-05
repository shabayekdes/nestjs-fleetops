import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  DATE_ONLY_MESSAGE,
  DATE_ONLY_PATTERN,
  IsNotAfterTomorrowUtc,
} from '../../common/date-only.js';
import { MAX_ODOMETER_KM } from '../../common/odometer.js';
import { IsDecimalString } from '../../common/decimal-string.js';
import { MaintenanceType } from '../../generated/prisma/client.js';
import { trim } from './maintenance-normalizers.js';

/**
 * Omitted = unchanged. type, performedOn and cost are NOT NULL columns, so an
 * explicit null is rejected. The other fields accept null to clear them.
 */
export class UpdateMaintenanceRecordDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(MaintenanceType)
  type?: MaintenanceType;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  @IsNotAfterTomorrowUtc()
  performedOn?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDecimalString({ integerDigits: 10, fractionDigits: 2, allowZero: true })
  cost?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ODOMETER_KM)
  odometerKm?: number | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  vendor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  nextServiceDueOn?: string | null;
}
