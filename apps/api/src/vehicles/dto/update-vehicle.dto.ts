import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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
  trimUpper,
  VIN_MESSAGE,
  VIN_PATTERN,
} from './vehicle-normalizers.js';

/**
 * Omitted = unchanged. makeId/modelId/vehicleTypeId/year/vin are NOT NULL columns, so an
 * explicit null is rejected (ValidateIf only skips undefined). licensePlate
 * accepts null to clear it.
 */
export class UpdateVehicleDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID('7')
  makeId?: string;

  /** Required whenever makeId is sent: a model belongs to exactly one make. */
  @ValidateIf(
    (o: UpdateVehicleDto, value: unknown) =>
      value !== undefined || o.makeId !== undefined,
  )
  @IsDefined({ message: 'modelId is required when makeId is changed' })
  @IsUUID('7')
  modelId?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID('7')
  vehicleTypeId?: string;

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
