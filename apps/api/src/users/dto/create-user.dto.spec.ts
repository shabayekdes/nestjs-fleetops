import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

const valid = {
  firstName: 'Jamie',
  lastName: 'Rivera',
  email: 'jamie@acme.test',
  password: 'a-long-enough-password',
  role: 'DRIVER',
};

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateUserDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('CreateUserDto', () => {
  it('accepts a valid payload', async () => {
    expect((await run(valid)).errors).toHaveLength(0);
  });

  it.each(['ADMIN', 'MANAGER', 'DRIVER'])('accepts role %s', async (role) => {
    expect((await run({ ...valid, role })).errors).toHaveLength(0);
  });

  it('trims and lowercases the email', async () => {
    const { dto, errors } = await run({
      ...valid,
      email: '  Jamie@ACME.Test ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('jamie@acme.test');
  });

  it('trims names', async () => {
    const { dto, errors } = await run({
      ...valid,
      firstName: '  Jamie ',
      lastName: ' Rivera  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.firstName).toBe('Jamie');
    expect(dto.lastName).toBe('Rivera');
  });

  it('rejects an invalid email', async () => {
    expect((await run({ ...valid, email: 'nope' })).fields).toContain('email');
  });

  it('rejects an email longer than 254 chars', async () => {
    const email = `${'a'.repeat(250)}@x.test`;
    expect((await run({ ...valid, email })).fields).toContain('email');
  });

  it('enforces password length 12..128', async () => {
    expect(
      (await run({ ...valid, password: 'a'.repeat(11) })).fields,
    ).toContain('password');
    expect(
      (await run({ ...valid, password: 'a'.repeat(12) })).errors,
    ).toHaveLength(0);
    expect(
      (await run({ ...valid, password: 'a'.repeat(128) })).errors,
    ).toHaveLength(0);
    expect(
      (await run({ ...valid, password: 'a'.repeat(129) })).fields,
    ).toContain('password');
  });

  it('never trims the password', async () => {
    const { dto, errors } = await run({
      ...valid,
      password: '  padded-password  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.password).toBe('  padded-password  ');
  });

  it.each<[string, unknown]>([
    ['invalid', 'SUPERUSER'],
    ['lowercase', 'admin'],
    ['empty', ''],
    ['null', null],
    ['numeric', 1],
  ])('rejects %s role', async (_n, role) => {
    expect((await run({ ...valid, role })).fields).toContain('role');
  });

  it('rejects a missing role (no silent default)', async () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.role;
    expect((await run(rest)).fields).toEqual(['role']);
  });

  it.each(['firstName', 'lastName'])(
    'rejects empty and whitespace-only %s',
    async (field) => {
      expect((await run({ ...valid, [field]: '' })).fields).toContain(field);
      expect((await run({ ...valid, [field]: '   ' })).fields).toContain(field);
    },
  );

  it.each(['firstName', 'lastName'])(
    'accepts a 100-char %s and rejects 101',
    async (field) => {
      expect(
        (await run({ ...valid, [field]: 'a'.repeat(100) })).errors,
      ).toHaveLength(0);
      expect(
        (await run({ ...valid, [field]: 'a'.repeat(101) })).fields,
      ).toContain(field);
    },
  );

  it('reports every missing field', async () => {
    expect((await run({})).fields.sort()).toEqual([
      'email',
      'firstName',
      'lastName',
      'password',
      'role',
    ]);
  });

  it.each(['organizationId', 'passwordHash', 'id'])(
    'rejects unknown property %s',
    async (key) => {
      expect((await run({ ...valid, [key]: 'x' })).fields).toContain(key);
    },
  );
});
