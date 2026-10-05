import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  DATE_ONLY_MESSAGE,
  DATE_ONLY_PATTERN,
  LICENSE_NUMBER_MESSAGE,
  LICENSE_NUMBER_PATTERN,
  trim,
  trimUpper,
} from './driver-normalizers.js';

/**
 * Omitted = unchanged. The four required columns reject an explicit null
 * (ValidateIf only skips undefined). userId accepts null to unlink.
 */
export class UpdateDriverDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trimUpper)
  @IsString()
  @MaxLength(30)
  @Matches(LICENSE_NUMBER_PATTERN, { message: LICENSE_NUMBER_MESSAGE })
  licenseNumber?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  licenseExpiresOn?: string;

  @IsOptional()
  @IsUUID('7')
  userId?: string | null;
}
