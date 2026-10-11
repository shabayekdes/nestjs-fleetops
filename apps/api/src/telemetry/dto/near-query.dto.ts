import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { toStrictNumber } from './telemetry-validators.js';

const finite = { allowNaN: false, allowInfinity: false } as const;

export class NearQueryDto {
  @Transform(toStrictNumber)
  @IsNumber(finite)
  @Min(-90)
  @Max(90)
  latitude: number;

  @Transform(toStrictNumber)
  @IsNumber(finite)
  @Min(-180)
  @Max(180)
  longitude: number;

  /** Search radius in meters, 1..50000. */
  @IsOptional()
  @Transform(toStrictNumber)
  @IsNumber(finite)
  @Min(1)
  @Max(50_000)
  radiusMeters: number = 5000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
