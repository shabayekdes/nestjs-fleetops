import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
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

/**
 * Omitted = unchanged. fueledOn, liters and totalCost are NOT NULL columns, so
 * an explicit null is rejected. odometerKm accepts null to clear it.
 */
export class UpdateFuelLogDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  @IsNotAfterTomorrowUtc()
  fueledOn?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDecimalString({ integerDigits: 5, fractionDigits: 3, allowZero: false })
  liters?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDecimalString({ integerDigits: 10, fractionDigits: 2, allowZero: true })
  totalCost?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ODOMETER_KM)
  odometerKm?: number | null;
}
