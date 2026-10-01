import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
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

export class CreateVehicleDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  make: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  model: string;

  /** JSON number only; no @Type, so "2023" is rejected. */
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @IsNotAfterNextYear()
  year: number;

  @Transform(trimUpper)
  @IsString()
  @Matches(VIN_PATTERN, { message: VIN_MESSAGE })
  vin: string;

  @IsOptional()
  @Transform(trimUpper)
  @IsString()
  @MaxLength(15)
  @Matches(LICENSE_PLATE_PATTERN, { message: LICENSE_PLATE_MESSAGE })
  licensePlate?: string | null;
}
