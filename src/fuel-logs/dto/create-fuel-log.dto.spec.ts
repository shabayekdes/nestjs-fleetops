import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFuelLogDto } from './create-fuel-log.dto.js';

const valid = (): Record<string, unknown> => ({
  fueledOn: '2026-06-01',
  liters: '45.5',
  totalCost: '80.00',
});

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateFuelLogDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { errors, fields: errors.map((e) => e.property) };
};

describe('CreateFuelLogDto', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a valid payload with and without odometer', async () => {
    expect((await run(valid())).errors).toHaveLength(0);
    expect((await run({ ...valid(), odometerKm: 1000 })).errors).toHaveLength(
      0,
    );
  });

  it('reports exactly the required fields for an empty body', async () => {
    expect([...(await run({})).fields].sort()).toEqual([
      'fueledOn',
      'liters',
      'totalCost',
    ]);
  });

  it.each(['2026-06-16', '1900-01-01'])('accepts fueledOn %s', async (v) => {
    expect((await run({ ...valid(), fueledOn: v })).errors).toHaveLength(0);
  });
  it.each(['2026-06-17', '1899-12-31', '2026-02-30', '2026-6-1', 5, null])(
    'rejects fueledOn %j',
    async (v) => {
      expect((await run({ ...valid(), fueledOn: v })).fields).toContain(
        'fueledOn',
      );
    },
  );

  it.each(['0.001', '1', '99999.999'])('accepts liters %j', async (v) => {
    expect((await run({ ...valid(), liters: v })).errors).toHaveLength(0);
  });
  it.each(['0', '0.000', '1.0001', '100000', '-1', 45.5, '', null])(
    'rejects liters %j',
    async (v) => {
      expect((await run({ ...valid(), liters: v })).fields).toContain('liters');
    },
  );

  it.each(['0', '0.00', '9999999999.99'])('accepts totalCost %j', async (v) => {
    expect((await run({ ...valid(), totalCost: v })).errors).toHaveLength(0);
  });
  it.each(['1.234', '10000000000', '-5', 80, '', null])(
    'rejects totalCost %j',
    async (v) => {
      expect((await run({ ...valid(), totalCost: v })).fields).toContain(
        'totalCost',
      );
    },
  );

  it.each([0, 9_999_999])('accepts odometerKm %i', async (v) => {
    expect((await run({ ...valid(), odometerKm: v })).errors).toHaveLength(0);
  });
  it.each([-1, 10_000_000, 1.5, '5'])('rejects odometerKm %j', async (v) => {
    expect((await run({ ...valid(), odometerKm: v })).fields).toContain(
      'odometerKm',
    );
  });

  it.each([
    'organizationId',
    'vehicleId',
    'driverId',
    'id',
    'createdAt',
    'extra',
  ])('rejects key %s', async (key) => {
    expect((await run({ ...valid(), [key]: 'x' })).fields).toContain(key);
  });
});
