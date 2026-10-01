import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '../../generated/prisma/client.js';
import { trim, trimLowercase } from './user-normalizers.js';

/**
 * Omitted = unchanged. Every column is NOT NULL, so an explicit null is
 * rejected (ValidateIf only skips undefined). No password field: passwords
 * change only through PATCH /auth/me/password.
 */
export class UpdateUserDto {
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
  @Transform(trimLowercase)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(Role)
  role?: Role;
}
