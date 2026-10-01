import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';

const valid = {
  organizationSlug: 'acme-logistics',
  email: 'alex@acme-logistics.test',
  password: 'FleetOps-dev-123!',
};

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(LoginDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('LoginDto', () => {
  it('accepts a valid payload', async () => {
    const { errors } = await run(valid);
    expect(errors).toHaveLength(0);
  });

  it('trims and lowercases slug and email', async () => {
    const { dto, errors } = await run({
      ...valid,
      organizationSlug: '  ACME-Logistics  ',
      email: '  Alex@ACME-Logistics.TEST ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.organizationSlug).toBe('acme-logistics');
    expect(dto.email).toBe('alex@acme-logistics.test');
  });

  it('never alters the password', async () => {
    const { dto, errors } = await run({ ...valid, password: '  Pa55 WORD  ' });
    expect(errors).toHaveLength(0);
    expect(dto.password).toBe('  Pa55 WORD  ');
  });

  it('reports every missing field', async () => {
    const { fields } = await run({});
    expect(fields.sort()).toEqual(['email', 'organizationSlug', 'password']);
  });

  it('rejects a whitespace-only slug', async () => {
    const { fields } = await run({ ...valid, organizationSlug: '   ' });
    expect(fields).toContain('organizationSlug');
  });

  it('rejects an invalid email', async () => {
    const { fields } = await run({ ...valid, email: 'not-an-email' });
    expect(fields).toContain('email');
  });

  it('accepts a 128-char password and rejects 129', async () => {
    expect(
      (await run({ ...valid, password: 'a'.repeat(128) })).errors,
    ).toHaveLength(0);
    const tooLong = await run({ ...valid, password: 'a'.repeat(129) });
    expect(tooLong.fields).toContain('password');
  });

  it('rejects an empty password', async () => {
    const { fields } = await run({ ...valid, password: '' });
    expect(fields).toContain('password');
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['numeric slug', { ...valid, organizationSlug: 123 }, 'organizationSlug'],
    ['null email', { ...valid, email: null }, 'email'],
    ['array email', { ...valid, email: ['a@b.test'] }, 'email'],
    ['object password', { ...valid, password: { a: 1 } }, 'password'],
  ])('handles %s without throwing', async (_name, plain, field) => {
    const { fields } = await run(plain);
    expect(fields).toContain(field);
  });

  it('rejects unknown properties', async () => {
    const { fields } = await run({ ...valid, isAdmin: true });
    expect(fields).toContain('isAdmin');
  });
});
