import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../../vehicles/dto/vehicle-normalizers.js';

/**
 * Query string for GET /api/v1/master-data/vehicle-makes/:makeId/models.
 * Same rules as ListVehicleMakesQueryDto. The make comes from the path, never
 * from the query.
 */
export class ListVehicleModelsQueryDto {
  /** Case-insensitive match anywhere in the model name. Blank is rejected. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  // Same page/limit contract as every other FleetOps list.
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

  /** true = also return retired models (e.g. to show an existing vehicle's model). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeInactive?: boolean;
}
