import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_FUTURE_SKEW_MS } from '../telemetry.constants.js';
import {
  IsIsoInstant,
  IsNotAfterNowPlus,
  toLowerCase,
} from './telemetry-validators.js';

const finite = { allowNaN: false, allowInfinity: false } as const;

export class TelemetryLocationDto {
  /** Degrees, -90..90. */
  @IsNumber(finite)
  @Min(-90)
  @Max(90)
  latitude: number;

  /** Degrees, -180..180. */
  @IsNumber(finite)
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class TelemetryEngineDto {
  @IsBoolean()
  on: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  rpm?: number;

  @IsOptional()
  @IsNumber(finite)
  @Min(-50)
  @Max(150)
  coolantTempC?: number;
}

export class CreateTelemetryReadingDto {
  /** UUIDv7 of a vehicle in your organization. */
  @Transform(toLowerCase)
  @IsUUID('7')
  vehicleId: string;

  /** ISO 8601 with an explicit offset, at most 5 minutes in the future. */
  @IsIsoInstant()
  @IsNotAfterNowPlus(MAX_FUTURE_SKEW_MS)
  timestamp: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => TelemetryLocationDto)
  location: TelemetryLocationDto;

  @IsNumber(finite)
  @Min(0)
  @Max(300)
  speedKph: number;

  @IsOptional()
  @IsNumber(finite)
  @Min(0)
  @Max(100)
  fuelLevelPercent?: number;

  @IsOptional()
  @IsNumber(finite)
  @Min(0)
  @Max(10_000_000)
  odometerKm?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelemetryEngineDto)
  engine?: TelemetryEngineDto;
}
