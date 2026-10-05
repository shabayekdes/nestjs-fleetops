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
import { AssignmentsService } from './assignments.service.js';
import type {
  AssignmentListResponseDto,
  AssignmentResponseDto,
} from './dto/assignment-response.dto.js';
import { CreateAssignmentDto } from './dto/create-assignment.dto.js';
import { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto.js';

const UUID_V7 = new ParseUUIDPipe({ version: '7' });

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
@Roles(Role.ADMIN, Role.MANAGER)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAssignmentsQueryDto,
  ): Promise<AssignmentListResponseDto> {
    return this.assignmentsService.findAll(user.organizationId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    return this.assignmentsService.create(user.organizationId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<AssignmentResponseDto> {
    return this.assignmentsService.findOne(user.organizationId, id);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_V7) id: string,
  ): Promise<AssignmentResponseDto> {
    return this.assignmentsService.end(user.organizationId, id);
  }
}
