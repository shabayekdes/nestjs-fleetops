import {
  type DynamicModule,
  type ModuleMetadata,
  Module,
  type Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Db, MongoClient } from 'mongodb';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { TELEMETRY_HEALTH } from '../health/telemetry-health.js';
import { MongoConnection } from './mongo/mongo-connection.js';
import {
  MONGO_CLIENT,
  MONGO_DB,
  TELEMETRY_READINGS_COLLECTION,
  VEHICLE_LATEST_STATUS_COLLECTION,
} from './mongo/mongo.tokens.js';
import type {
  TelemetryReadingDocument,
  VehicleLatestStatusDocument,
} from './mongo/telemetry-documents.js';
import {
  TELEMETRY_READINGS,
  VEHICLE_LATEST_STATUS,
} from './mongo/telemetry-schema.js';
import { buildMongoClientOptions } from './telemetry-config.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryIngestionService } from './telemetry-ingestion.service.js';
import { TelemetryQueryService } from './telemetry-query.service.js';
import {
  VEHICLE_DIRECTORY,
  type VehicleDirectory,
} from './vehicle-directory.port.js';

export interface TelemetryModuleOptions {
  /** Modules that export the vehicleDirectory provider. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** Provider implementing VehicleDirectory (owned by the core app). */
  vehicleDirectory: Type<VehicleDirectory>;
}

/**
 * Optional telemetry feature (opt-in through MONGODB_URI). L7: MongoDB
 * infrastructure. L8: ingestion and query endpoints. It reaches vehicles only
 * through the VEHICLE_DIRECTORY port, supplied by register().
 */
@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryIngestionService,
    TelemetryQueryService,
    {
      provide: MONGO_CLIENT,
      inject: [ConfigService],
      // The constructor does no I/O: connecting happens in MongoConnection.
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const uri = config.get('MONGODB_URI', { infer: true });
        if (!uri) throw new Error('MONGODB_URI is required for telemetry');
        return new MongoClient(
          uri,
          buildMongoClientOptions({
            MONGODB_MAX_POOL_SIZE: config.get('MONGODB_MAX_POOL_SIZE', {
              infer: true,
            }),
            MONGODB_SERVER_SELECTION_TIMEOUT_MS: config.get(
              'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
              { infer: true },
            ),
          }),
        );
      },
    },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT, ConfigService],
      useFactory: (
        client: MongoClient,
        config: ConfigService<EnvironmentVariables, true>,
      ) => {
        const name = config.get('MONGODB_DB', { infer: true });
        if (!name) throw new Error('MONGODB_DB is required for telemetry');
        return client.db(name);
      },
    },
    {
      provide: TELEMETRY_READINGS_COLLECTION,
      inject: [MONGO_DB],
      useFactory: (db: Db) =>
        db.collection<TelemetryReadingDocument>(TELEMETRY_READINGS),
    },
    {
      provide: VEHICLE_LATEST_STATUS_COLLECTION,
      inject: [MONGO_DB],
      useFactory: (db: Db) =>
        db.collection<VehicleLatestStatusDocument>(VEHICLE_LATEST_STATUS),
    },
    MongoConnection,
    { provide: TELEMETRY_HEALTH, useExisting: MongoConnection },
  ],
  exports: [
    TELEMETRY_HEALTH,
    TELEMETRY_READINGS_COLLECTION,
    VEHICLE_LATEST_STATUS_COLLECTION,
  ],
})
export class TelemetryModule {
  static register(options: TelemetryModuleOptions): DynamicModule {
    return {
      module: TelemetryModule,
      imports: options.imports,
      providers: [
        { provide: VEHICLE_DIRECTORY, useExisting: options.vehicleDirectory },
      ],
    };
  }
}
