import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  DATE_ONLY_MESSAGE,
  DATE_ONLY_PATTERN,
  LICENSE_NUMBER_MESSAGE,
  LICENSE_NUMBER_PATTERN,
  trim,
  trimUpper,
} from './driver-normalizers.js';

export class CreateDriverDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @Transform(trimUpper)
  @IsString()
  @MaxLength(30)
  @Matches(LICENSE_NUMBER_PATTERN, { message: LICENSE_NUMBER_MESSAGE })
  licenseNumber: string;

  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsISO8601({ strict: true })
  licenseExpiresOn: string;

  /** Optional login account of this driver; null/omitted = not linked. */
  @IsOptional()
  @IsUUID('7')
  userId?: string | null;
}
