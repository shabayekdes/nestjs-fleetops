import { describe, expect, it } from 'vitest';
import { buildHref, singleParam } from './search-params';

describe('singleParam', () => {
  it('returns a string and rejects arrays and undefined', () => {
    expect(singleParam('a')).toBe('a');
    expect(singleParam('')).toBe('');
    expect(singleParam(['a', 'b'])).toBeUndefined();
    expect(singleParam(undefined)).toBeUndefined();
  });
});

describe('buildHref', () => {
  it('returns the bare path without params', () => {
    expect(buildHref('/vehicles', {})).toBe('/vehicles');
  });

  it('drops undefined and empty values', () => {
    expect(buildHref('/v', { a: undefined, b: '', c: 'x' })).toBe('/v?c=x');
  });

  it('encodes values and keeps numbers', () => {
    expect(buildHref('/v', { make: 'A&B c', page: 2 })).toBe(
      '/v?make=A%26B+c&page=2',
    );
  });
});
