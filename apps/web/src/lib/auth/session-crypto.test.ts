import { describe, expect, it } from 'vitest';
import {
  decryptSession,
  encryptSession,
  type SessionPayload,
} from './session-crypto';

const SECRET = 's'.repeat(32);
const payload: SessionPayload = {
  accessToken: 'header.payload.signature',
  expiresAt: 1_900_000_000_000,
};

function flip(part: string): string {
  // First char: the last char of a base64url string can hold unused padding bits.
  const first = part[0] === 'A' ? 'B' : 'A';
  return first + part.slice(1);
}

describe('session crypto', () => {
  it('round-trips a payload', () => {
    expect(decryptSession(encryptSession(payload, SECRET), SECRET)).toEqual(
      payload,
    );
  });

  it('encrypts the same payload differently each time', () => {
    expect(encryptSession(payload, SECRET)).not.toBe(
      encryptSession(payload, SECRET),
    );
  });

  it('does not contain the plaintext token', () => {
    const value = encryptSession(payload, SECRET);
    expect(value).not.toContain(payload.accessToken);
    expect(value.startsWith('v1.')).toBe(true);
  });

  it.each([
    ['iv', 1],
    ['ciphertext', 2],
    ['tag', 3],
  ])('returns null when the %s is changed', (_label, index) => {
    const parts = encryptSession(payload, SECRET).split('.');
    parts[index] = flip(parts[index]);
    expect(decryptSession(parts.join('.'), SECRET)).toBeNull();
  });

  it('returns null with the wrong secret', () => {
    expect(
      decryptSession(encryptSession(payload, SECRET), 'x'.repeat(32)),
    ).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['too few parts', 'v1.a.b'],
    ['too many parts', 'v1.a.b.c.d'],
    ['wrong version', 'v2.AAAA.AAAA.AAAA'],
    ['invalid base64', 'v1.!!!.@@@.###'],
  ])('returns null for %s', (_label, value) => {
    expect(decryptSession(value, SECRET)).toBeNull();
  });

  it.each([
    ['missing accessToken', { expiresAt: 1 }],
    ['non-string accessToken', { accessToken: 5, expiresAt: 1 }],
    ['non-number expiresAt', { accessToken: 'x', expiresAt: '1' }],
  ])('returns null for a payload with %s', (_label, bad) => {
    const value = encryptSession(bad as unknown as SessionPayload, SECRET);
    expect(decryptSession(value, SECRET)).toBeNull();
  });
});
