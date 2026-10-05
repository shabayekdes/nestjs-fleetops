import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListDriversQueryDto } from './list-drivers-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListDriversQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListDriversQueryDto', () => {
  it('defaults page 1 and limit 20', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it('coerces numeric strings', async () => {
    const { dto, errors } = await run({ page: '3', limit: '100' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 100 });
  });

  it('accepts limit 1 and rejects 0 / 101', async () => {
    expect((await run({ limit: '1' })).errors).toHaveLength(0);
    expect((await run({ limit: '0' })).fields).toContain('limit');
    expect((await run({ limit: '101' })).fields).toContain('limit');
  });

  it.each(['abc', '1.5', '', '-1', '0'])('rejects limit %j', async (limit) => {
    expect((await run({ limit })).fields).toContain('limit');
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects page %j', async (page) => {
    expect((await run({ page })).fields).toContain('page');
  });

  it('rejects unknown filters', async () => {
    expect((await run({ role: 'ADMIN' })).fields).toContain('role');
  });
});
