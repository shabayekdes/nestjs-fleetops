import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVehicleMakesQueryDto } from './list-vehicle-makes-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListVehicleMakesQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListVehicleMakesQueryDto', () => {
  it('accepts an empty query with page 1 and limit 20 as numbers', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.search).toBeUndefined();
    expect(dto.includeInactive).toBeUndefined();
  });

  it('trims search', async () => {
    const { dto, errors } = await run({ search: '  toy ' });
    expect(errors).toHaveLength(0);
    expect(dto.search).toBe('toy');
  });

  it.each(['', '   '])('rejects blank search %j', async (search) => {
    const { errors, fields } = await run({ search });
    expect(fields).toEqual(['search']);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('accepts a search of exactly 100 characters', async () => {
    const { errors } = await run({ search: 'a'.repeat(100) });
    expect(errors).toHaveLength(0);
  });

  it('rejects a search of 101 characters', async () => {
    const { errors, fields } = await run({ search: 'a'.repeat(101) });
    expect(fields).toEqual(['search']);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('rejects a repeated search parameter (array)', async () => {
    const { errors, fields } = await run({ search: ['toy', 'car'] });
    expect(fields).toEqual(['search']);
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('rejects an unknown query parameter', async () => {
    const { errors, fields } = await run({ unknown: 'value' });
    expect(fields).toEqual(['unknown']);
    expect(errors[0].constraints).toHaveProperty('whitelistValidation');
  });

  it('coerces numeric page and limit strings', async () => {
    const { dto, errors } = await run({ page: '3', limit: '100' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 100 });
  });

  it.each([
    ['page', '0', 'min'],
    ['page', 'abc', 'isInt'],
    ['page', '1.5', 'isInt'],
    ['limit', '0', 'min'],
    ['limit', '101', 'max'],
    ['limit', 'abc', 'isInt'],
  ])('rejects %s=%j (%s)', async (field, value, constraint) => {
    const { errors, fields } = await run({ [field]: value });
    expect(fields).toEqual([field]);
    expect(errors[0].constraints).toHaveProperty(constraint);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses includeInactive=%j as %j', async (value, expected) => {
    const { dto, errors } = await run({ includeInactive: value });
    expect(errors).toHaveLength(0);
    expect(dto.includeInactive).toBe(expected);
  });

  it.each(['yes', '1', ''])('rejects includeInactive=%j', async (value) => {
    const { errors, fields } = await run({ includeInactive: value });
    expect(fields).toEqual(['includeInactive']);
    expect(errors[0].constraints).toHaveProperty('isBoolean');
  });
});
