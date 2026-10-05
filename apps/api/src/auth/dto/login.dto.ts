import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimLowercase = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(trimLowercase)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationSlug: string;

  @Transform(trimLowercase)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Never trimmed or case-folded. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
