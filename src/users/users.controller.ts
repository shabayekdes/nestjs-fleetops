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
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type {
  UserListResponseDto,
  UserResponseDto,
} from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.findAll(user.organizationId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.create(user.organizationId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<void> {
    return this.usersService.remove(user, id);
  }
}
