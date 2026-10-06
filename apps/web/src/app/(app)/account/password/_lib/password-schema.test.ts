import { describe, expect, it } from 'vitest';
import { passwordSchema } from './password-schema';

const ok = {
  currentPassword: 'old-password-1',
  newPassword: 'new-password-12',
  confirmPassword: 'new-password-12',
};

function errors(input: Record<string, string>) {
  const result = passwordSchema.safeParse(input);
  return result.success
    ? {}
    : (result.error.flatten().fieldErrors as Record<string, string[]>);
}

describe('passwordSchema', () => {
  it('accepts matching passwords', () => {
    expect(passwordSchema.safeParse(ok).success).toBe(true);
  });

  it('puts a mismatch on the confirmation field', () => {
    expect(errors({ ...ok, confirmPassword: 'different-1234' })).toEqual({
      confirmPassword: ['Passwords do not match'],
    });
  });

  it('requires 12 characters for the new password', () => {
    const eleven = 'a'.repeat(11);
    expect(
      errors({ ...ok, newPassword: eleven, confirmPassword: eleven })
        .newPassword,
    ).toEqual(['New password must be at least 12 characters']);
    const twelve = 'a'.repeat(12);
    expect(
      passwordSchema.safeParse({
        ...ok,
        newPassword: twelve,
        confirmPassword: twelve,
      }).success,
    ).toBe(true);
  });

  it('requires the current password', () => {
    expect(errors({ ...ok, currentPassword: '' }).currentPassword).toEqual([
      'Enter your current password',
    ]);
  });

  it('never trims', () => {
    const padded = `  ${'a'.repeat(10)}  `;
    const result = passwordSchema.safeParse({
      currentPassword: ' x ',
      newPassword: padded,
      confirmPassword: padded,
    });
    expect(result.data?.newPassword).toBe(padded);
    expect(result.data?.currentPassword).toBe(' x ');
  });

  it('does not compare the new password with the current one', () => {
    const same = 'same-password-123';
    expect(
      passwordSchema.safeParse({
        currentPassword: same,
        newPassword: same,
        confirmPassword: same,
      }).success,
    ).toBe(true);
  });
});
