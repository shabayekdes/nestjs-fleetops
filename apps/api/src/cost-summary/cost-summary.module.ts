import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import {
  CostSummaryController,
  FleetCostSummaryController,
} from './cost-summary.controller.js';
import { CostSummaryService } from './cost-summary.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CostSummaryController, FleetCostSummaryController],
  providers: [CostSummaryService],
})
export class CostSummaryModule {}
