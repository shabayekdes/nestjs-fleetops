import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListUsersQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListUsersQueryDto', () => {
  it('defaults page 1, limit 20 and no role', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.role).toBeUndefined();
  });

  it('coerces numeric strings', async () => {
    const { dto, errors } = await run({ page: '3', limit: '50' });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('accepts limit 100 and rejects 101', async () => {
    expect((await run({ limit: '100' })).errors).toHaveLength(0);
    expect((await run({ limit: '101' })).fields).toContain('limit');
  });

  it('rejects limit 0', async () => {
    expect((await run({ limit: '0' })).fields).toContain('limit');
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejects page %s', async (page) => {
    expect((await run({ page })).fields).toContain('page');
  });

  it.each(['ADMIN', 'MANAGER', 'DRIVER'])('accepts role %s', async (role) => {
    const { dto, errors } = await run({ role });
    expect(errors).toHaveLength(0);
    expect(dto.role).toBe(role);
  });

  it.each(['admin', 'ROOT', ''])('rejects role %j', async (role) => {
    expect((await run({ role })).fields).toContain('role');
  });

  it.each(['organizationId', 'foo'])('rejects unknown param %s', async (k) => {
    expect((await run({ [k]: 'x' })).fields).toContain(k);
  });
});
