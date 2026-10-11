import type { LogLevel } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  ValidateIf,
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

  /**
   * Number of trusted reverse proxies / load balancers in front of the API.
   * 0 ignores X-Forwarded-For. Booleans are deliberately unsupported: trusting
   * every hop lets any client spoof req.ip.
   */
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY: number = 0;

  /**
   * MongoDB connection string for the optional telemetry module. Unset or
   * empty disables telemetry.
   */
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @Matches(/^mongodb(\+srv)?:\/\/.+/, {
    message:
      'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
  })
  MONGODB_URI?: string;

  /** Telemetry database name. Required when MONGODB_URI is set. */
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @ValidateIf((env: EnvironmentVariables) => env.MONGODB_URI !== undefined)
  @Matches(/^[A-Za-z0-9_-]{1,54}$/, {
    message:
      'MONGODB_DB is required when MONGODB_URI is set (1-54 letters, digits, _ or -)',
  })
  MONGODB_DB?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  MONGODB_MAX_POOL_SIZE: number = 10;

  /** Keeps /health/ready under the Docker HEALTHCHECK timeout. */
  @IsInt()
  @Min(500)
  @Max(30000)
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: number = 2000;

  /** Learning default, not a retention policy (L14). */
  @IsInt()
  @Min(1)
  @Max(3650)
  TELEMETRY_RAW_RETENTION_DAYS: number = 30;
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
