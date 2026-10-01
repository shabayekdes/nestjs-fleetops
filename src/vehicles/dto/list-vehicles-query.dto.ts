import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsNotAfterNextYear,
  MIN_VEHICLE_YEAR,
  trim,
} from './vehicle-normalizers.js';

export class ListVehiclesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  make?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @IsNotAfterNextYear()
  year?: number;
}
