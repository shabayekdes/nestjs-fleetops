import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMaintenanceRecordDto } from './update-maintenance-record.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateMaintenanceRecordDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('UpdateMaintenanceRecordDto', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts an empty body', async () => {
    expect((await run({})).errors).toHaveLength(0);
  });

  it('accepts a full valid payload and trims', async () => {
    const { dto, errors } = await run({
      type: 'REPAIR',
      performedOn: '2026-06-10',
      cost: '1.5',
      odometerKm: 5,
      description: ' x ',
      vendor: ' y ',
      nextServiceDueOn: '2026-09-01',
    });
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('x');
    expect(dto.vendor).toBe('y');
  });

  it.each(['type', 'performedOn', 'cost'])(
    'rejects explicit null for %s',
    async (field) => {
      expect((await run({ [field]: null })).fields).toContain(field);
    },
  );

  it.each(['odometerKm', 'description', 'vendor', 'nextServiceDueOn'])(
    'accepts and keeps null for %s',
    async (field) => {
      const { dto, errors } = await run({ [field]: null });
      expect(errors).toHaveLength(0);
      expect((dto as unknown as Record<string, unknown>)[field]).toBeNull();
    },
  );

  it('validates values when provided', async () => {
    expect((await run({ type: 'NOPE' })).fields).toContain('type');
    expect((await run({ performedOn: '2026-06-17' })).fields).toContain(
      'performedOn',
    );
    expect((await run({ performedOn: '1899-12-31' })).fields).toContain(
      'performedOn',
    );
    expect((await run({ cost: 12.5 })).fields).toContain('cost');
    expect((await run({ cost: '12.345' })).fields).toContain('cost');
    expect((await run({ odometerKm: -1 })).fields).toContain('odometerKm');
    expect((await run({ odometerKm: 10_000_000 })).fields).toContain(
      'odometerKm',
    );
    expect((await run({ description: '  ' })).fields).toContain('description');
    expect((await run({ vendor: 'a'.repeat(101) })).fields).toContain('vendor');
    expect((await run({ nextServiceDueOn: '2026-02-30' })).fields).toContain(
      'nextServiceDueOn',
    );
  });

  it.each(['organizationId', 'vehicleId', 'id', 'createdAt', 'extra'])(
    'rejects key %s',
    async (key) => {
      expect((await run({ [key]: 'x' })).fields).toContain(key);
    },
  );
});
