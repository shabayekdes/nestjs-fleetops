import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './server';

describe('parseServerEnv', () => {
  it('accepts http and https origins', () => {
    expect(parseServerEnv({ API_BASE_URL: 'http://localhost:3000' })).toEqual({
      API_BASE_URL: 'http://localhost:3000',
    });
    expect(parseServerEnv({ API_BASE_URL: 'https://api.example.com' })).toEqual(
      { API_BASE_URL: 'https://api.example.com' },
    );
  });

  it('strips a trailing slash', () => {
    expect(parseServerEnv({ API_BASE_URL: 'http://localhost:3000/' })).toEqual({
      API_BASE_URL: 'http://localhost:3000',
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { API_BASE_URL: '' }],
    ['not a url', { API_BASE_URL: 'not-a-url' }],
    ['ftp protocol', { API_BASE_URL: 'ftp://host' }],
  ])('throws when API_BASE_URL is %s', (_label, source) => {
    expect(() => parseServerEnv(source)).toThrow(/API_BASE_URL/);
  });

  it.each([
    ['a path', 'http://host/api'],
    ['a query', 'http://host/?a=1'],
    ['a hash', 'http://host/#x'],
  ])('rejects an API_BASE_URL with %s', (_label, value) => {
    expect(() => parseServerEnv({ API_BASE_URL: value })).toThrow(/origin/);
  });
});
