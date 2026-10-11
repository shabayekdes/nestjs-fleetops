import { IsOptional } from 'class-validator';
import { MAX_DAILY_RANGE_DAYS, MS_PER_DAY } from '../telemetry.constants.js';
import {
  IsAfterField,
  IsIanaTimeZone,
  IsStrictDateOnly,
  IsWithinRangeOf,
} from './telemetry-validators.js';

export class DailyQueryDto {
  /** First local day, YYYY-MM-DD. */
  @IsStrictDateOnly()
  from: string;

  /** Last local day (inclusive), YYYY-MM-DD, at most 31 days from `from`. */
  @IsStrictDateOnly()
  @IsAfterField('from', true)
  @IsWithinRangeOf('from', (MAX_DAILY_RANGE_DAYS - 1) * MS_PER_DAY)
  to: string;

  /** IANA time zone used to bucket days. Fixed offsets are rejected. */
  @IsOptional()
  @IsIanaTimeZone()
  timezone: string = 'UTC';
}
