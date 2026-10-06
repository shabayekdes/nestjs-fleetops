import { describe, expect, it } from 'vitest';
import {
  driverListHref,
  driverListParams,
  parseDriverListParams,
} from './list-params';

describe('parseDriverListParams', () => {
  it('uses the defaults', () => {
    expect(parseDriverListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it('reads page and limit and ignores unknown params silently', () => {
    const result = parseDriverListParams({
      page: '3',
      limit: '5',
      notice: 'x',
    });
    expect(result.query).toEqual({ page: 3, limit: 5 });
    expect(result.ignored).toEqual([]);
  });

  it('reports invalid values', () => {
    const result = parseDriverListParams({ page: '0', limit: '500' });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual(['page', 'limit']);
  });
});

describe('driver list links', () => {
  it('leaves out the defaults', () => {
    expect(driverListParams({ page: 1, limit: 20 })).toEqual({
      page: undefined,
      limit: undefined,
    });
    expect(driverListHref({ page: 2, limit: 5 })).toBe(
      '/drivers?limit=5&page=2',
    );
    expect(driverListHref({ page: 2 }, { page: 9 })).toBe('/drivers?page=9');
  });
});
