import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { MAX_BATCH } from '../telemetry.constants.js';
import { CreateTelemetryReadingDto } from './create-telemetry-reading.dto.js';

export class BatchTelemetryReadingsDto {
  /** 1 to 200 readings. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => CreateTelemetryReadingDto)
  readings: CreateTelemetryReadingDto[];
}
