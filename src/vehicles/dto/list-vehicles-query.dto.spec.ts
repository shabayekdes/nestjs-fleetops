import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVehiclesQueryDto } from './list-vehicles-query.dto.js';
import { maxVehicleYear } from './vehicle-normalizers.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListVehiclesQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListVehiclesQueryDto', () => {
  it('defaults page 1 and limit 20 as numbers', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.make).toBeUndefined();
    expect(dto.year).toBeUndefined();
  });

  it('coerces numeric strings', async () => {
    const { dto, errors } = await run({
      page: '3',
      limit: '100',
      year: '2024',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 100, year: 2024 });
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

  it('rejects repeated page (array)', async () => {
    expect((await run({ page: ['1', '2'] })).fields).toContain('page');
  });

  it('trims make and model', async () => {
    const { dto, errors } = await run({ make: '  Ford ', model: ' Transit ' });
    expect(errors).toHaveLength(0);
    expect(dto.make).toBe('Ford');
    expect(dto.model).toBe('Transit');
  });

  it.each(['make', 'model'])('rejects empty, blank, 51-char %s', async (f) => {
    expect((await run({ [f]: '' })).fields).toContain(f);
    expect((await run({ [f]: '   ' })).fields).toContain(f);
    expect((await run({ [f]: 'a'.repeat(51) })).fields).toContain(f);
    expect((await run({ [f]: 'a'.repeat(50) })).errors).toHaveLength(0);
  });

  it.each(['1899', 'abc', '2024.5', String(maxVehicleYear() + 1)])(
    'rejects year %j',
    async (year) => {
      expect((await run({ year })).fields).toContain('year');
    },
  );

  it('accepts year bounds', async () => {
    expect((await run({ year: '1900' })).errors).toHaveLength(0);
    expect((await run({ year: String(maxVehicleYear()) })).errors).toHaveLength(
      0,
    );
  });

  it.each(['sort', 'search', 'organizationId', 'foo'])(
    'rejects unknown param %s',
    async (key) => {
      expect((await run({ [key]: 'x' })).fields).toContain(key);
    },
  );
});
