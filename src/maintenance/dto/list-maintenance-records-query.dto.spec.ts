import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMaintenanceRecordsQueryDto } from './list-maintenance-records-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListMaintenanceRecordsQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListMaintenanceRecordsQueryDto', () => {
  it('defaults page 1, limit 20, no filters', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
    expect(dto.type).toBeUndefined();
    expect(dto.from).toBeUndefined();
  });

  it('coerces numeric strings and accepts filters', async () => {
    const { dto, errors } = await run({
      page: '2',
      limit: '100',
      type: 'TIRES',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 100,
      type: 'TIRES',
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects page %j', async (page) => {
    expect((await run({ page })).fields).toContain('page');
  });
  it.each(['0', '101', 'abc', '1.5', ''])('rejects limit %j', async (limit) => {
    expect((await run({ limit })).fields).toContain('limit');
  });

  it.each(['nope', 'oil_change', ''])('rejects type %j', async (type) => {
    expect((await run({ type })).fields).toContain('type');
  });

  it.each(['from', 'to'])('rejects bad %s', async (field) => {
    for (const v of [
      '2026-02-30',
      '2026-1-1',
      'x',
      '',
      '2026-01-01T00:00:00Z',
    ]) {
      expect((await run({ [field]: v })).fields).toContain(field);
    }
  });

  it('rejects unknown keys', async () => {
    expect((await run({ vehicleId: 'x' })).fields).toContain('vehicleId');
  });
});
