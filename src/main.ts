import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
