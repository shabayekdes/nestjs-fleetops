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
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import type {
  DriverListResponseDto,
  DriverResponseDto,
} from './dto/driver-response.dto.js';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { DriversService } from './drivers.service.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@Controller('drivers')
@Roles(Role.ADMIN, Role.MANAGER)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListDriversQueryDto,
  ): Promise<DriverListResponseDto> {
    return this.driversService.findAll(user.organizationId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDriverDto,
  ): Promise<DriverResponseDto> {
    return this.driversService.create(user.organizationId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<DriverResponseDto> {
    return this.driversService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverResponseDto> {
    return this.driversService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<void> {
    return this.driversService.remove(user.organizationId, id);
  }
}
