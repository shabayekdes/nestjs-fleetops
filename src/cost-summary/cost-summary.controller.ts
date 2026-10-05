import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CostSummaryService } from './cost-summary.service.js';
import { CostSummaryQueryDto } from './dto/cost-summary-query.dto.js';
import type { CostSummaryResponseDto } from './dto/cost-summary-response.dto.js';

@Controller('vehicles/:vehicleId/cost-summary')
@Roles(Role.ADMIN, Role.MANAGER)
export class CostSummaryController {
  constructor(private readonly service: CostSummaryService) {}

  @Get()
  getSummary(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', new ParseUUIDPipe({ version: '7' })) vehicleId: string,
    @Query() query: CostSummaryQueryDto,
  ): Promise<CostSummaryResponseDto> {
    return this.service.getSummary(user.organizationId, vehicleId, query);
  }
}
