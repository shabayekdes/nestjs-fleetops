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

export class CreateMaintenanceRecordDto {
  @IsEnum(MaintenanceType)
  type: MaintenanceType;

  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  @IsNotAfterTomorrowUtc()
  performedOn: string;

  /** Decimal string, e.g. "89.90". JSON numbers are rejected. */
  @IsDecimalString({ integerDigits: 10, fractionDigits: 2, allowZero: true })
  cost: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ODOMETER_KM)
  odometerKm?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  vendor?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  nextServiceDueOn?: string;
}
