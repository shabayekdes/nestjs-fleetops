import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { CostSummaryModule } from './cost-summary/cost-summary.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { FuelLogsModule } from './fuel-logs/fuel-logs.module.js';
import { HealthModule } from './health/health.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { UsersModule } from './users/users.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests load only .env.test, never .env, so they cannot hit the dev DB.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    DriversModule,
    AssignmentsModule,
    ScheduleModule.forRoot(),
    MaintenanceModule,
    FuelLogsModule,
    CostSummaryModule,
    DashboardModule,
    MasterDataModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
