import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_READINGS_RANGE_DAYS, MS_PER_DAY } from '../telemetry.constants.js';
import {
  IsAfterField,
  IsIsoInstant,
  IsWithinRangeOf,
} from './telemetry-validators.js';

export class ListReadingsQueryDto {
  /** Inclusive lower bound, ISO 8601 with an explicit offset. */
  @IsIsoInstant()
  from: string;

  /** Inclusive upper bound, after from and at most 7 days later. */
  @IsIsoInstant()
  @IsAfterField('from')
  @IsWithinRangeOf('from', MAX_READINGS_RANGE_DAYS * MS_PER_DAY)
  to: string;

  /** Cursor: only readings strictly older than this (from nextCursor). */
  @IsOptional()
  @IsIsoInstant()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 100;
}
