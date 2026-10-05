import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateMaintenanceRecordDto } from './dto/create-maintenance-record.dto.js';
import { ListMaintenanceRecordsQueryDto } from './dto/list-maintenance-records-query.dto.js';
import type {
  MaintenanceRecordListResponseDto,
  MaintenanceRecordResponseDto,
} from './dto/maintenance-record-response.dto.js';
import { UpdateMaintenanceRecordDto } from './dto/update-maintenance-record.dto.js';
import { MaintenanceRecordsService } from './maintenance-records.service.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@ApiTags('maintenance-records')
@ApiBearerAuth()
@Controller('vehicles/:vehicleId/maintenance-records')
@Roles(Role.ADMIN, Role.MANAGER)
export class MaintenanceRecordsController {
  constructor(private readonly service: MaintenanceRecordsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Query() query: ListMaintenanceRecordsQueryDto,
  ): Promise<MaintenanceRecordListResponseDto> {
    return this.service.findAll(user.organizationId, vehicleId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Body() dto: CreateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordResponseDto> {
    return this.service.create(user.organizationId, vehicleId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Param('id', UUID_V7) id: string,
  ): Promise<MaintenanceRecordResponseDto> {
    return this.service.findOne(user.organizationId, vehicleId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Param('id', UUID_V7) id: string,
    @Body() dto: UpdateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordResponseDto> {
    return this.service.update(user.organizationId, vehicleId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Param('id', UUID_V7) id: string,
  ): Promise<void> {
    return this.service.remove(user.organizationId, vehicleId, id);
  }
}
