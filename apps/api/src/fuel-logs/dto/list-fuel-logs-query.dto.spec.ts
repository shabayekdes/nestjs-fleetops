import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListFuelLogsQueryDto } from './list-fuel-logs-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListFuelLogsQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListFuelLogsQueryDto', () => {
  it('defaults page 1 and limit 20', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it('coerces and accepts from/to', async () => {
    const { dto, errors } = await run({
      page: '3',
      limit: '5',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 5, from: '2026-01-01' });
  });

  it.each(['0', 'abc', '1.5', ''])('rejects page %j', async (page) => {
    expect((await run({ page })).fields).toContain('page');
  });
  it.each(['0', '101', 'abc', ''])('rejects limit %j', async (limit) => {
    expect((await run({ limit })).fields).toContain('limit');
  });
  it.each(['from', 'to'])('rejects bad %s', async (field) => {
    for (const v of ['2026-02-30', '2026-1-1', 'x', '']) {
      expect((await run({ [field]: v })).fields).toContain(field);
    }
  });
  it('rejects unknown keys such as type', async () => {
    expect((await run({ type: 'TIRES' })).fields).toContain('type');
  });
});
