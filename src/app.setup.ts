import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppLogger } from './common/app-logger.js';
import type { NextFunction, Request, Response } from 'express';
import {
  AllExceptionsFilter,
  sendErrorResponse,
} from './common/http/all-exceptions.filter.js';
import { requestContextMiddleware } from './common/http/request-context.middleware.js';
import { validationExceptionFactory } from './common/http/validation-exception.factory.js';
import type { EnvironmentVariables } from './config/env.validation.js';
import { isSwaggerEnabled, setupSwagger } from './swagger.js';

/**
 * Application-wide HTTP configuration. Shared by main.ts and e2e tests so
 * tests exercise the same prefix, versioning and validation as production.
 */
export function configureApp(app: INestApplication): void {
  // First, so the request ID exists for body-parser errors, guards and 404s.
  app.use(requestContextMiddleware);

  // Nest's own 404 handler only covers the /api prefix; nothing is served outside it.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    sendErrorResponse(
      new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`),
      req,
      res,
    );
  });

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  app.useLogger(
    createAppLogger(nodeEnv, config.get('LOG_LEVEL', { infer: true })),
  );

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (isSwaggerEnabled(nodeEnv)) {
    setupSwagger(app);
  }
}
