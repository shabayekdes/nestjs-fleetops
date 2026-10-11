import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Db, MongoClient } from 'mongodb';
import type { TelemetryHealthCheck } from '../../health/telemetry-health.js';
import { MONGO_CLIENT, MONGO_DB } from './mongo.tokens.js';
import {
  TelemetrySchemaError,
  verifyTelemetrySchema,
} from './telemetry-schema.js';

/**
 * Owns the MongoClient lifecycle. Fails fast at boot when MongoDB is
 * unreachable or the schema is not set up (run `npm run mongo:setup`).
 */
@Injectable()
export class MongoConnection
  implements OnModuleInit, OnModuleDestroy, TelemetryHealthCheck
{
  private readonly logger = new Logger(MongoConnection.name);

  constructor(
    @Inject(MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(MONGO_DB) private readonly db: Db,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.ping();
      const problems = await verifyTelemetrySchema(this.db);
      if (problems.length > 0) {
        throw new TelemetrySchemaError(
          `MongoDB telemetry schema is not set up: ${problems.join('; ')}. Run npm run mongo:setup`,
        );
      }
    } catch (error) {
      // A failing close() must not replace the original error.
      await this.client.close().catch(() => undefined);
      throw error;
    }
    this.logger.log(`Connected to MongoDB (database ${this.db.databaseName})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async ping(): Promise<void> {
    await this.db.command({ ping: 1 });
  }
}
