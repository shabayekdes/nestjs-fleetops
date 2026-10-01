import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests load only .env.test, never .env, so they cannot hit the dev DB.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
