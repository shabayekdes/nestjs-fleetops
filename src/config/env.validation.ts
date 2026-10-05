import type { LogLevel } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** Access token lifetime in seconds. */
  @IsInt()
  @Min(60)
  @Max(86400)
  JWT_EXPIRES_IN: number = 900;

  @IsIn(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL: LogLevel = 'log';

  /** Rate-limit window in seconds. */
  @IsInt()
  @Min(1)
  @Max(3600)
  THROTTLE_TTL_SECONDS: number = 60;

  /** Per account+IP on login, per user on password change, per window. */
  @IsInt()
  @Min(1)
  @Max(10000)
  THROTTLE_LIMIT: number = 5;

  /** Per IP on login and password change, per window. */
  @IsInt()
  @Min(1)
  @Max(10000)
  THROTTLE_IP_LIMIT: number = 30;
}

/**
 * Validates process.env at startup so the app fails fast on bad config
 * instead of failing later at runtime.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  return validated;
}
