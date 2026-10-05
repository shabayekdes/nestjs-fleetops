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
import { CreateFuelLogDto } from './dto/create-fuel-log.dto.js';
import { ListFuelLogsQueryDto } from './dto/list-fuel-logs-query.dto.js';
import type {
  FuelLogListResponseDto,
  FuelLogResponseDto,
} from './dto/fuel-log-response.dto.js';
import { UpdateFuelLogDto } from './dto/update-fuel-log.dto.js';
import { FuelLogsService } from './fuel-logs.service.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@ApiTags('fuel-logs')
@ApiBearerAuth()
@Controller('vehicles/:vehicleId/fuel-logs')
@Roles(Role.ADMIN, Role.MANAGER)
export class FuelLogsController {
  constructor(private readonly service: FuelLogsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Query() query: ListFuelLogsQueryDto,
  ): Promise<FuelLogListResponseDto> {
    return this.service.findAll(user.organizationId, vehicleId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Body() dto: CreateFuelLogDto,
  ): Promise<FuelLogResponseDto> {
    return this.service.create(user.organizationId, vehicleId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Param('id', UUID_V7) id: string,
  ): Promise<FuelLogResponseDto> {
    return this.service.findOne(user.organizationId, vehicleId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', UUID_V7) vehicleId: string,
    @Param('id', UUID_V7) id: string,
    @Body() dto: UpdateFuelLogDto,
  ): Promise<FuelLogResponseDto> {
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
