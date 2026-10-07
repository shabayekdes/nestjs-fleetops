import { describe, expect, it } from 'vitest';
import { canonicalDecimal } from './decimal';

describe('canonicalDecimal', () => {
  it.each([
    ['089.9', 2, '89.90'],
    ['89.90', 2, '89.90'],
    ['89', 2, '89.00'],
    ['0', 2, '0.00'],
    ['000', 2, '0.00'],
    ['0.5', 2, '0.50'],
    ['45.5', 3, '45.500'],
    ['12', 3, '12.000'],
    ['9999999999.99', 2, '9999999999.99'],
    ['5', 0, '5'],
  ])('%j at scale %i gives %j', (value, scale, expected) => {
    expect(canonicalDecimal(value, scale)).toBe(expected);
  });

  it('returns invalid input unchanged', () => {
    expect(canonicalDecimal('abc', 2)).toBe('abc');
    expect(canonicalDecimal('1.234', 2)).toBe('1.234');
    expect(canonicalDecimal('-1', 2)).toBe('-1');
    expect(canonicalDecimal('', 2)).toBe('');
  });
});
