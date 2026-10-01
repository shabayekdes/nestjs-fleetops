import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';

/**
 * Application-wide HTTP configuration. Shared by main.ts and e2e tests so
 * tests exercise the same prefix, versioning and validation as production.
 */
export function configureApp(app: INestApplication): void {
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
    }),
  );
}
