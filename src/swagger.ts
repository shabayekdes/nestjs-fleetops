import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/http/error-response.dto.js';

export function isSwaggerEnabled(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

export function setupSwagger(app: INestApplication): void {
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

  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, config, {
      extraModels: [ErrorResponseDto],
    }),
  );
}
