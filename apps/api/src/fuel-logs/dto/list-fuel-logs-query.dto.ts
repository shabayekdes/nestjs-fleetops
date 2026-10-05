import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
} from '../../common/date-only.js';

export class ListFuelLogsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** Inclusive lower bound on fueledOn. */
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  from?: string;

  /** Inclusive upper bound on fueledOn. */
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  to?: string;
}
