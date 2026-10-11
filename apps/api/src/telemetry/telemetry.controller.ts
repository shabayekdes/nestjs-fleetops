import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { BatchTelemetryReadingsDto } from './dto/batch-telemetry-readings.dto.js';
import { CreateTelemetryReadingDto } from './dto/create-telemetry-reading.dto.js';
import { DailyQueryDto } from './dto/daily-query.dto.js';
import { LatestListQueryDto } from './dto/latest-list-query.dto.js';
import { ListReadingsQueryDto } from './dto/list-readings-query.dto.js';
import { NearQueryDto } from './dto/near-query.dto.js';
import type {
  BatchIngestResponseDto,
  DailySummaryListResponseDto,
  LatestStatusListResponseDto,
  NearbyVehiclesResponseDto,
  TelemetryReadingListResponseDto,
  TelemetryReadingResponseDto,
  VehicleLatestStatusResponseDto,
} from './dto/telemetry-response.dto.js';
import { TelemetryIngestionService } from './telemetry-ingestion.service.js';
import { TelemetryQueryService } from './telemetry-query.service.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@ApiTags('telemetry')
@ApiBearerAuth()
@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly ingestion: TelemetryIngestionService,
    private readonly queries: TelemetryQueryService,
  ) {}

  @Post('readings')
  @Roles(Role.ADMIN, Role.MANAGER)
  ingestOne(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTelemetryReadingDto,
  ): Promise<TelemetryReadingResponseDto> {
    return this.ingestion.ingestOne(user, dto);
  }

  /** Always 200: per-reading outcomes are in the body (accepted, rejected). */
  @Post('readings/batch')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  ingestBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: BatchTelemetryReadingsDto,
  ): Promise<BatchIngestResponseDto> {
    return this.ingestion.ingestBatch(user, dto);
  }

  @Get('latest')
  listLatest(
    @CurrentUser() user: AuthUser,
    @Query() query: LatestListQueryDto,
  ): Promise<LatestStatusListResponseDto> {
    return this.queries.listLatest(user, query);
  }

  @Get('latest/near')
  findNear(
    @CurrentUser() user: AuthUser,
    @Query() query: NearQueryDto,
  ): Promise<NearbyVehiclesResponseDto> {
    return this.queries.findNear(user, query);
  }

  @Get('vehicles/:vehicleId/readings')
  findReadings(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Query() query: ListReadingsQueryDto,
  ): Promise<TelemetryReadingListResponseDto> {
    return this.queries.findReadings(user, vehicleId, query);
  }

  @Get('vehicles/:vehicleId/latest')
  findLatest(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
  ): Promise<VehicleLatestStatusResponseDto> {
    return this.queries.findLatest(user, vehicleId);
  }

  @Get('vehicles/:vehicleId/daily')
  findDaily(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Query() query: DailyQueryDto,
  ): Promise<DailySummaryListResponseDto> {
    return this.queries.findDaily(user, vehicleId, query);
  }
}
