import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './server';

const SECRET = 'a'.repeat(32);

describe('parseServerEnv', () => {
  it('accepts http and https origins', () => {
    expect(
      parseServerEnv({
        API_BASE_URL: 'http://localhost:3000',
        SESSION_SECRET: SECRET,
      }).API_BASE_URL,
    ).toBe('http://localhost:3000');
    expect(
      parseServerEnv({
        API_BASE_URL: 'https://api.example.com',
        SESSION_SECRET: SECRET,
      }).API_BASE_URL,
    ).toBe('https://api.example.com');
  });

  it('strips a trailing slash', () => {
    expect(
      parseServerEnv({
        API_BASE_URL: 'http://localhost:3000/',
        SESSION_SECRET: SECRET,
      }).API_BASE_URL,
    ).toBe('http://localhost:3000');
  });

  it.each([
    ['missing', {}],
    ['empty', { API_BASE_URL: '' }],
    ['not a url', { API_BASE_URL: 'not-a-url' }],
    ['ftp protocol', { API_BASE_URL: 'ftp://host' }],
  ])('throws when API_BASE_URL is %s', (_label, source) => {
    expect(() => parseServerEnv({ SESSION_SECRET: SECRET, ...source })).toThrow(
      /API_BASE_URL/,
    );
  });

  it.each([
    ['a path', 'http://host/api'],
    ['a query', 'http://host/?a=1'],
    ['a hash', 'http://host/#x'],
  ])('rejects an API_BASE_URL with %s', (_label, value) => {
    expect(() =>
      parseServerEnv({ API_BASE_URL: value, SESSION_SECRET: SECRET }),
    ).toThrow(/origin/);
  });
});

describe('SESSION_SECRET', () => {
  const base = { API_BASE_URL: 'http://localhost:3000' };

  it('rejects a missing secret and names the variable', () => {
    expect(() => parseServerEnv(base)).toThrow(/SESSION_SECRET/);
  });

  it('rejects 31 characters and accepts 32', () => {
    expect(() =>
      parseServerEnv({ ...base, SESSION_SECRET: 'a'.repeat(31) }),
    ).toThrow(/SESSION_SECRET must be at least 32 characters/);
    expect(
      parseServerEnv({ ...base, SESSION_SECRET: 'a'.repeat(32) })
        .SESSION_SECRET,
    ).toBe('a'.repeat(32));
  });
});
