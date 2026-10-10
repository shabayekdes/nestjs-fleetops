import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ServiceStatus } from '../../generated/prisma/client.js';
import { IsNotAfterNextYear, MIN_VEHICLE_YEAR } from './vehicle-normalizers.js';

export class ListVehiclesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsUUID('7')
  makeId?: string;

  @IsOptional()
  @IsUUID('7')
  modelId?: string;

  @IsOptional()
  @IsUUID('7')
  vehicleTypeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @IsNotAfterNextYear()
  year?: number;

  @IsOptional()
  @IsEnum(ServiceStatus)
  serviceStatus?: ServiceStatus;
}
