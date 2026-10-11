import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CollectionInfo } from 'mongodb';
import { MongoConnection } from './mongo-connection.js';
import { MONGO_CLIENT, MONGO_DB } from './mongo.tokens.js';
import { TelemetrySchemaError } from './telemetry-schema.js';

describe('MongoConnection', () => {
  const order: string[] = [];
  const connect = jest.fn<() => Promise<void>>();
  const close = jest.fn<() => Promise<void>>();
  const command = jest.fn<(cmd: Record<string, unknown>) => Promise<unknown>>();
  const listCollections =
    jest.fn<() => { toArray: () => Promise<CollectionInfo[]> }>();
  const listIndexes = jest.fn<() => { toArray: () => Promise<unknown[]> }>();
  let logSpy: jest.SpiedFunction<Logger['log']>;

  const uri = 'mongodb://user:secret@db.example.net:27017';
  const client = { connect, close };
  const db = {
    databaseName: 'fleetops_telemetry_x',
    command,
    listCollections,
    collection: () => ({ listIndexes }),
  };

  const completeCollections = [
    {
      name: 'telemetry_readings',
      type: 'timeseries',
      options: {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'meta',
          granularity: 'seconds',
        },
      },
    },
    { name: 'vehicle_latest_status', type: 'collection', options: {} },
  ] as unknown as CollectionInfo[];

  const indexesByCall = () => {
    // readState lists indexes for readings first, then latest status.
    listIndexes
      .mockReturnValueOnce({
        toArray: () => {
          order.push('verify');
          return Promise.resolve([
            {
              name: 'org_vehicle_timestamp',
              key: {
                'meta.organizationId': 1,
                'meta.vehicleId': 1,
                timestamp: -1,
              },
            },
          ]);
        },
      })
      .mockReturnValueOnce({
        toArray: () =>
          Promise.resolve([
            {
              name: 'org_vehicle_unique',
              key: { organizationId: 1, vehicleId: 1 },
              unique: true,
            },
            {
              name: 'org_location_2dsphere',
              key: { organizationId: 1, location: '2dsphere' },
            },
          ]),
      });
  };

  const build = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MongoConnection,
        { provide: MONGO_CLIENT, useValue: client },
        { provide: MONGO_DB, useValue: db },
      ],
    }).compile();
    return moduleRef.get(MongoConnection);
  };

  beforeEach(() => {
    order.length = 0;
    for (const fn of [connect, close, command, listCollections, listIndexes]) {
      fn.mockReset();
    }
    connect.mockImplementation(() => {
      order.push('connect');
      return Promise.resolve();
    });
    close.mockResolvedValue(undefined);
    command.mockImplementation(() => {
      order.push('ping');
      return Promise.resolve({ ok: 1 });
    });
    listCollections.mockReturnValue({
      toArray: () => Promise.resolve(completeCollections),
    });
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('connects, pings, then verifies the schema in that order', async () => {
    indexesByCall();
    const service = await build();

    await service.onModuleInit();

    expect(order).toEqual(['connect', 'ping', 'verify']);
    expect(command).toHaveBeenCalledWith({ ping: 1 });
    expect(close).not.toHaveBeenCalled();
  });

  it('logs the database name and never the URI or credentials', async () => {
    indexesByCall();
    const service = await build();

    await service.onModuleInit();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('fleetops_telemetry_x');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain(uri);
  });

  it('still throws the original error when close() also rejects', async () => {
    const failure = new Error('ECONNREFUSED');
    connect.mockRejectedValue(failure);
    close.mockRejectedValue(new Error('close failed'));
    const service = await build();

    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the client and rethrows when connect rejects', async () => {
    const failure = new Error('ECONNREFUSED');
    connect.mockRejectedValue(failure);
    const service = await build();

    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
    expect(command).not.toHaveBeenCalled();
  });

  it('closes the client when the ping rejects', async () => {
    const failure = new Error('ping failed');
    command.mockRejectedValue(failure);
    const service = await build();

    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('throws TelemetrySchemaError naming mongo:setup and closes on schema problems', async () => {
    listCollections.mockReturnValue({ toArray: () => Promise.resolve([]) });
    const service = await build();

    const error: unknown = await service
      .onModuleInit()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelemetrySchemaError);
    expect((error as Error).message).toContain('npm run mongo:setup');
    expect(close).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Connected to MongoDB'),
    );
  });

  it('closes the client once on destroy', async () => {
    const service = await build();

    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ping runs the ping command', async () => {
    const service = await build();

    await expect(service.ping()).resolves.toBeUndefined();
    expect(command).toHaveBeenCalledWith({ ping: 1 });
  });

  it('ping rejects when the command fails', async () => {
    command.mockRejectedValue(new Error('down'));
    const service = await build();

    await expect(service.ping()).rejects.toThrow('down');
  });
});
