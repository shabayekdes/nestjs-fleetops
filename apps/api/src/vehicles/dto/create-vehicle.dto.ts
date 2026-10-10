import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsNotAfterNextYear,
  LICENSE_PLATE_MESSAGE,
  LICENSE_PLATE_PATTERN,
  MIN_VEHICLE_YEAR,
  trimUpper,
  VIN_MESSAGE,
  VIN_PATTERN,
} from './vehicle-normalizers.js';

export class CreateVehicleDto {
  @IsUUID('7')
  makeId: string;

  @IsUUID('7')
  modelId: string;

  @IsUUID('7')
  vehicleTypeId: string;

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
