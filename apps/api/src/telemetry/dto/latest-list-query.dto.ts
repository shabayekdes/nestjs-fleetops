import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { toLowerCase } from './telemetry-validators.js';

export class LatestListQueryDto {
  /** Cursor: only vehicles with a greater id (from nextCursor). */
  @IsOptional()
  @Transform(toLowerCase)
  @IsUUID('7')
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
