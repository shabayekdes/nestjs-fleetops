import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMaintenanceRecordDto } from './create-maintenance-record.dto.js';

const valid = (): Record<string, unknown> => ({
  type: 'OIL_CHANGE',
  performedOn: '2026-06-01',
  cost: '89.90',
});

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateMaintenanceRecordDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('CreateMaintenanceRecordDto', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a minimal valid payload', async () => {
    expect((await run(valid())).errors).toHaveLength(0);
  });

  it('accepts a full valid payload and trims text', async () => {
    const { dto, errors } = await run({
      ...valid(),
      description: '  Synthetic oil ',
      vendor: ' Joe Garage  ',
      odometerKm: 120000,
      nextServiceDueOn: '2026-12-01',
    });
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('Synthetic oil');
    expect(dto.vendor).toBe('Joe Garage');
  });

  it('reports exactly the required fields for an empty body', async () => {
    expect([...(await run({})).fields].sort()).toEqual([
      'cost',
      'performedOn',
      'type',
    ]);
  });

  it.each(['oil_change', 'NOPE', '', 5, null])('rejects type %j', async (v) => {
    expect((await run({ ...valid(), type: v })).fields).toContain('type');
  });

  it.each(['OIL_CHANGE', 'TIRES', 'BRAKES', 'INSPECTION', 'REPAIR', 'OTHER'])(
    'accepts type %s',
    async (type) => {
      expect((await run({ ...valid(), type })).errors).toHaveLength(0);
    },
  );

  describe('performedOn', () => {
    it.each(['2026-06-15', '2026-06-16', '1900-01-01', '2024-02-29'])(
      'accepts %s',
      async (v) => {
        expect((await run({ ...valid(), performedOn: v })).errors).toHaveLength(
          0,
        );
      },
    );
    it.each([
      '2026-06-17',
      '1899-12-31',
      '2026-02-30',
      '2026-6-1',
      '2026-06-01T00:00:00Z',
      '',
      20260601,
      null,
    ])('rejects %j', async (v) => {
      expect((await run({ ...valid(), performedOn: v })).fields).toContain(
        'performedOn',
      );
    });
  });

  describe('cost', () => {
    it.each(['0', '0.00', '89.9', '9999999999.99'])('accepts %j', async (v) => {
      expect((await run({ ...valid(), cost: v })).errors).toHaveLength(0);
    });
    it.each([89.9, 0, '12.345', '-1', '1e3', '', null, '10000000000'])(
      'rejects %j',
      async (v) => {
        expect((await run({ ...valid(), cost: v })).fields).toContain('cost');
      },
    );
  });

  describe('odometerKm', () => {
    it.each([0, 1, 9_999_999])('accepts %i', async (v) => {
      expect((await run({ ...valid(), odometerKm: v })).errors).toHaveLength(0);
    });
    it.each([-1, 10_000_000, 1.5, '100', 'abc'])('rejects %j', async (v) => {
      expect((await run({ ...valid(), odometerKm: v })).fields).toContain(
        'odometerKm',
      );
    });
  });

  describe.each([
    ['description', 500],
    ['vendor', 100],
  ])('%s', (field, max) => {
    it('accepts the max length and rejects one more', async () => {
      expect(
        (await run({ ...valid(), [field]: 'a'.repeat(max) })).errors,
      ).toHaveLength(0);
      expect(
        (await run({ ...valid(), [field]: 'a'.repeat(max + 1) })).fields,
      ).toContain(field);
    });
    it.each(['', '   ', 5])('rejects %j', async (v) => {
      expect((await run({ ...valid(), [field]: v })).fields).toContain(field);
    });
  });

  describe('nextServiceDueOn', () => {
    it('accepts a far-future date (no upper bound)', async () => {
      expect(
        (await run({ ...valid(), nextServiceDueOn: '2099-01-01' })).errors,
      ).toHaveLength(0);
    });
    it.each(['2026-13-01', '2026-02-30', '2026-6-1', '', 5])(
      'rejects %j',
      async (v) => {
        expect(
          (await run({ ...valid(), nextServiceDueOn: v })).fields,
        ).toContain('nextServiceDueOn');
      },
    );
  });

  it.each(['organizationId', 'vehicleId', 'id', 'createdAt', 'extra'])(
    'rejects unknown/server-owned key %s',
    async (key) => {
      expect((await run({ ...valid(), [key]: 'x' })).fields).toContain(key);
    },
  );
});
