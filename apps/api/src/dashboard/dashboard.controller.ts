import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { DashboardService } from './dashboard.service.js';
import type {
  FleetDashboardResponseDto,
  MyDashboardResponseDto,
} from './dto/dashboard-response.dto.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('fleet')
  @Roles(Role.ADMIN, Role.MANAGER)
  getFleet(@CurrentUser() user: AuthUser): Promise<FleetDashboardResponseDto> {
    return this.service.getFleet(user.organizationId);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser): Promise<MyDashboardResponseDto> {
    return this.service.getMe(user);
  }
}
