import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateUserDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('UpdateUserDto', () => {
  it('accepts an empty object', async () => {
    expect((await run({})).errors).toHaveLength(0);
  });

  it('accepts a full valid payload', async () => {
    const { errors } = await run({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.test',
      role: 'MANAGER',
    });
    expect(errors).toHaveLength(0);
  });

  it.each(['firstName', 'lastName', 'email', 'role'])(
    'rejects null %s',
    async (field) => {
      expect((await run({ [field]: null })).fields).toContain(field);
    },
  );

  it('rejects an invalid role', async () => {
    expect((await run({ role: 'ROOT' })).fields).toContain('role');
  });

  it('normalizes email and trims names', async () => {
    const { dto, errors } = await run({
      email: ' New@ACME.test ',
      firstName: ' Z ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('new@acme.test');
    expect(dto.firstName).toBe('Z');
  });

  it('rejects empty and whitespace-only names', async () => {
    expect((await run({ firstName: '' })).fields).toContain('firstName');
    expect((await run({ lastName: '  ' })).fields).toContain('lastName');
  });

  it('rejects an invalid email', async () => {
    expect((await run({ email: 'bad' })).fields).toContain('email');
  });

  it('rejects a 101-char name', async () => {
    expect((await run({ firstName: 'a'.repeat(101) })).fields).toContain(
      'firstName',
    );
  });

  it.each(['password', 'passwordHash', 'organizationId', 'id'])(
    'rejects unknown property %s',
    async (key) => {
      expect((await run({ [key]: 'x' })).fields).toContain(key);
    },
  );
});
