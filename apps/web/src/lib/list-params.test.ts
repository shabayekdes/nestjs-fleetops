import { describe, expect, it } from 'vitest';
import {
  parseDateRange,
  parsePageAndLimit,
  readSingleParam,
} from './list-params';

describe('readSingleParam', () => {
  it('returns a string and reports an array', () => {
    const ignored: string[] = [];
    expect(readSingleParam({ a: 'x' }, 'a', ignored)).toBe('x');
    expect(readSingleParam({}, 'b', ignored)).toBeUndefined();
    expect(readSingleParam({ c: ['1', '2'] }, 'c', ignored)).toBeUndefined();
    expect(ignored).toEqual(['c']);
  });
});

describe('parsePageAndLimit', () => {
  function parse(raw: Record<string, string | string[] | undefined>) {
    const ignored: string[] = [];
    return { ...parsePageAndLimit(raw, ignored), ignored };
  }

  it('uses the defaults', () => {
    expect(parse({})).toEqual({ page: 1, limit: 20, ignored: [] });
  });

  it('reads valid values', () => {
    expect(parse({ page: '3', limit: '100' })).toEqual({
      page: 3,
      limit: 100,
      ignored: [],
    });
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', '1000001'],
    ['limit', '0'],
    ['limit', '101'],
    ['limit', '1e2'],
    ['limit', ''],
  ])('ignores %s=%j and keeps the default', (name, value) => {
    const result = parse({ [name]: value });
    expect(result.ignored).toEqual([name]);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('ignores a repeated key once', () => {
    expect(parse({ page: ['1', '2'] }).ignored).toEqual(['page']);
  });
});

describe('parseDateRange', () => {
  it('reads valid dates and trims them', () => {
    const ignored: string[] = [];
    expect(
      parseDateRange({ from: '2026-01-01', to: ' 2026-02-28 ' }, ignored),
    ).toEqual({ from: '2026-01-01', to: '2026-02-28' });
    expect(ignored).toEqual([]);
  });

  it('leaves absent and empty values out silently', () => {
    const ignored: string[] = [];
    expect(parseDateRange({ to: '' }, ignored)).toEqual({});
    expect(ignored).toEqual([]);
  });

  it('drops invalid and repeated values with a warning', () => {
    const ignored: string[] = [];
    expect(
      parseDateRange({ from: '2026-02-30', to: ['2026-01-01', 'x'] }, ignored),
    ).toEqual({});
    expect(ignored).toEqual(['from', 'to']);
  });

  it('does not check from against to', () => {
    expect(
      parseDateRange({ from: '2026-05-01', to: '2026-01-01' }, []),
    ).toEqual({ from: '2026-05-01', to: '2026-01-01' });
  });
});
