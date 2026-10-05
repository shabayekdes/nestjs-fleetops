import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  DATE_ONLY_MESSAGE,
  DATE_ONLY_PATTERN,
  IsNotAfterTomorrowUtc,
} from '../../common/date-only.js';
import { MAX_ODOMETER_KM } from '../../common/odometer.js';
import { IsDecimalString } from '../../common/decimal-string.js';

export class CreateFuelLogDto {
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  @IsNotAfterTomorrowUtc()
  fueledOn: string;

  /** Decimal string, positive, up to 3 decimal places, e.g. "45.500". */
  @IsDecimalString({ integerDigits: 5, fractionDigits: 3, allowZero: false })
  liters: string;

  /** Decimal string, up to 2 decimal places, e.g. "80.00". */
  @IsDecimalString({ integerDigits: 10, fractionDigits: 2, allowZero: true })
  totalCost: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ODOMETER_KM)
  odometerKm?: number;
}
