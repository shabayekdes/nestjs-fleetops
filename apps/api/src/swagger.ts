import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './common/http/error-response.dto.js';

export function isSwaggerEnabled(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('FleetOps API')
    .setVersion('v1')
    .addBearerAuth()
    .addGlobalResponse({
      status: 'default',
      description: 'Error',
      type: ErrorResponseDto,
    })
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app));
}
