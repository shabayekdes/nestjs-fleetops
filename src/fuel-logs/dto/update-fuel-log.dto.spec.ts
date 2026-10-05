import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFuelLogDto } from './update-fuel-log.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateFuelLogDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('UpdateFuelLogDto', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts an empty body and a full valid body', async () => {
    expect((await run({})).errors).toHaveLength(0);
    expect(
      (
        await run({
          fueledOn: '2026-06-10',
          liters: '10',
          totalCost: '0',
          odometerKm: 5,
        })
      ).errors,
    ).toHaveLength(0);
  });

  it.each(['fueledOn', 'liters', 'totalCost'])(
    'rejects explicit null for %s',
    async (field) => {
      expect((await run({ [field]: null })).fields).toContain(field);
    },
  );

  it('accepts and keeps null odometerKm', async () => {
    const { dto, errors } = await run({ odometerKm: null });
    expect(errors).toHaveLength(0);
    expect(dto.odometerKm).toBeNull();
  });

  it('validates provided values', async () => {
    expect((await run({ fueledOn: '2026-06-17' })).fields).toContain(
      'fueledOn',
    );
    expect((await run({ liters: '0' })).fields).toContain('liters');
    expect((await run({ liters: 5 })).fields).toContain('liters');
    expect((await run({ totalCost: '1.234' })).fields).toContain('totalCost');
    expect((await run({ odometerKm: -1 })).fields).toContain('odometerKm');
  });

  it.each(['organizationId', 'vehicleId', 'id', 'extra'])(
    'rejects key %s',
    async (key) => {
      expect((await run({ [key]: 'x' })).fields).toContain(key);
    },
  );
});
