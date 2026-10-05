import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto.js';

const valid = {
  currentPassword: 'old-password-123',
  newPassword: 'new-password-1234',
};

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ChangePasswordDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ChangePasswordDto', () => {
  it('accepts a valid payload', async () => {
    expect((await run(valid)).errors).toHaveLength(0);
  });

  it('rejects an 11-char newPassword and accepts 12', async () => {
    expect(
      (await run({ ...valid, newPassword: 'a'.repeat(11) })).fields,
    ).toContain('newPassword');
    expect(
      (await run({ ...valid, newPassword: 'a'.repeat(12) })).errors,
    ).toHaveLength(0);
  });

  it('accepts a 128-char newPassword and rejects 129', async () => {
    expect(
      (await run({ ...valid, newPassword: 'a'.repeat(128) })).errors,
    ).toHaveLength(0);
    expect(
      (await run({ ...valid, newPassword: 'a'.repeat(129) })).fields,
    ).toContain('newPassword');
  });

  it('rejects an empty currentPassword', async () => {
    expect((await run({ ...valid, currentPassword: '' })).fields).toContain(
      'currentPassword',
    );
  });

  it('rejects a 129-char currentPassword', async () => {
    expect(
      (await run({ ...valid, currentPassword: 'a'.repeat(129) })).fields,
    ).toContain('currentPassword');
  });

  it('reports every missing field', async () => {
    expect((await run({})).fields.sort()).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });

  it('never trims passwords', async () => {
    const { dto, errors } = await run({
      currentPassword: '  old  ',
      newPassword: '  padded-password  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.currentPassword).toBe('  old  ');
    expect(dto.newPassword).toBe('  padded-password  ');
  });

  it('counts whitespace toward the minimum length', async () => {
    expect(
      (await run({ ...valid, newPassword: ' '.repeat(12) })).errors,
    ).toHaveLength(0);
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      'numeric currentPassword',
      { ...valid, currentPassword: 1 },
      'currentPassword',
    ],
    ['null newPassword', { ...valid, newPassword: null }, 'newPassword'],
    ['object newPassword', { ...valid, newPassword: { a: 1 } }, 'newPassword'],
  ])('handles %s without throwing', async (_n, plain, field) => {
    expect((await run(plain)).fields).toContain(field);
  });

  it('rejects unknown properties', async () => {
    expect((await run({ ...valid, role: 'ADMIN' })).fields).toContain('role');
  });
});
