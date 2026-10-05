import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IsNotAfterNextYear,
  LICENSE_PLATE_MESSAGE,
  LICENSE_PLATE_PATTERN,
  MIN_VEHICLE_YEAR,
  trim,
  trimUpper,
  VIN_MESSAGE,
  VIN_PATTERN,
} from './vehicle-normalizers.js';

/**
 * Omitted = unchanged. make/model/year/vin are NOT NULL columns, so an
 * explicit null is rejected (ValidateIf only skips undefined). licensePlate
 * accepts null to clear it.
 */
export class UpdateVehicleDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  make?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  model?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @IsNotAfterNextYear()
  year?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trimUpper)
  @IsString()
  @Matches(VIN_PATTERN, { message: VIN_MESSAGE })
  vin?: string;

  @IsOptional()
  @Transform(trimUpper)
  @IsString()
  @MaxLength(15)
  @Matches(LICENSE_PLATE_PATTERN, { message: LICENSE_PLATE_MESSAGE })
  licensePlate?: string | null;
}
