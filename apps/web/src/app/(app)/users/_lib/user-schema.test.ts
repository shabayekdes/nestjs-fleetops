import { describe, expect, it } from 'vitest';
import {
  changedUserFields,
  createUserSchema,
  editUserSchema,
  type UserInput,
} from './user-schema';

const good = {
  firstName: ' Ada ',
  lastName: ' Lovelace ',
  email: '  Ada@Example.TEST ',
  password: 'a'.repeat(12),
  role: 'DRIVER',
};

function messages(result: ReturnType<typeof createUserSchema.safeParse>) {
  if (result.success) return {};
  return result.error.flatten().fieldErrors as Record<string, string[]>;
}

describe('createUserSchema', () => {
  it('trims, lowercases the email and keeps the rest', () => {
    const result = createUserSchema.safeParse(good);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      password: 'a'.repeat(12),
      role: 'DRIVER',
    });
  });

  it('shows the required messages', () => {
    const errors = messages(
      createUserSchema.safeParse({
        firstName: '  ',
        lastName: '',
        email: ' ',
        password: '',
        role: '',
      }),
    );
    expect(errors.firstName).toEqual(['Enter a first name']);
    expect(errors.lastName).toEqual(['Enter a last name']);
    expect(errors.email).toEqual(['Enter an email']);
    expect(errors.password).toEqual([
      'Password must be at least 12 characters',
    ]);
    expect(errors.role).toEqual(['Choose a role']);
  });

  it('limits names to 100 characters', () => {
    expect(
      createUserSchema.safeParse({ ...good, firstName: 'a'.repeat(100) })
        .success,
    ).toBe(true);
    expect(
      messages(
        createUserSchema.safeParse({ ...good, firstName: 'a'.repeat(101) }),
      ).firstName,
    ).toEqual(['At most 100 characters']);
  });

  it('limits the email to 254 characters', () => {
    const email = (n: number) => `${'a'.repeat(n - 5)}@b.cd`.padEnd(n, 'x');
    expect(
      createUserSchema.safeParse({ ...good, email: email(254) }).success,
    ).toBe(true);
    expect(
      messages(createUserSchema.safeParse({ ...good, email: email(255) }))
        .email,
    ).toEqual(['At most 254 characters']);
  });

  it('checks the password length and never trims it', () => {
    const run = (password: string) =>
      createUserSchema.safeParse({ ...good, password });
    expect(run('a'.repeat(11)).success).toBe(false);
    expect(run('a'.repeat(12)).success).toBe(true);
    expect(run('a'.repeat(128)).success).toBe(true);
    expect(run('a'.repeat(129)).success).toBe(false);
    // Eleven letters and a space: 12 characters, spaces count.
    expect(run('a'.repeat(11) + ' ').success).toBe(true);
    expect(run(`  ${'a'.repeat(10)}  `).data?.password).toBe(
      `  ${'a'.repeat(10)}  `,
    );
  });

  it('rejects an invalid role', () => {
    expect(
      messages(createUserSchema.safeParse({ ...good, role: 'ROOT' })).role,
    ).toEqual(['Choose a role']);
  });
});

describe('editUserSchema', () => {
  it('allows a missing role', () => {
    const result = editUserSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.test',
    });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBeUndefined();
  });

  it('rejects an invalid role', () => {
    expect(
      editUserSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.test',
        role: 'ROOT',
      }).success,
    ).toBe(false);
  });
});

describe('changedUserFields', () => {
  const original: UserInput = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    role: 'DRIVER',
  };

  it('returns nothing when nothing changed', () => {
    expect(changedUserFields(original, { ...original })).toEqual({});
  });

  it('treats an email that differs only in case or spaces as unchanged', () => {
    const parsed = editUserSchema.parse({
      ...original,
      email: '  ADA@Example.test ',
    });
    expect(changedUserFields(original, parsed)).toEqual({});
  });

  it('includes a role change', () => {
    expect(
      changedUserFields(original, { ...original, role: 'MANAGER' }),
    ).toEqual({
      role: 'MANAGER',
    });
  });

  it('does not include an undefined role', () => {
    expect(
      changedUserFields(original, { ...original, role: undefined }),
    ).toEqual({});
  });

  it('includes several changed keys', () => {
    expect(
      changedUserFields(original, {
        firstName: 'Augusta',
        lastName: 'King',
        email: 'ak@example.test',
        role: 'ADMIN',
      }),
    ).toEqual({
      firstName: 'Augusta',
      lastName: 'King',
      email: 'ak@example.test',
      role: 'ADMIN',
    });
  });
});
