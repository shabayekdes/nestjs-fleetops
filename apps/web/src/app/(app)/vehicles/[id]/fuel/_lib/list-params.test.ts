import { describe, expect, it } from 'vitest';
import { fuelListHref, parseFuelListParams } from './list-params';

describe('parseFuelListParams', () => {
  it('uses the defaults', () => {
    expect(parseFuelListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it('reads valid values', () => {
    const result = parseFuelListParams({
      page: '2',
      limit: '10',
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(result.query).toEqual({
      page: 2,
      limit: 10,
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(result.hasFilters).toBe(true);
  });

  it('drops invalid values leniently and reports them', () => {
    const result = parseFuelListParams({
      page: 'x',
      from: '2026-02-30',
      to: ['2026-01-01', '2026-01-02'],
    });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual(['page', 'from', 'to']);
    expect(result.hasFilters).toBe(false);
  });

  it('ignores type and unknown params silently', () => {
    expect(
      parseFuelListParams({ type: 'TIRES', notice: 'fuel-log-created' })
        .ignored,
    ).toEqual([]);
  });

  it('does not check from against to', () => {
    const result = parseFuelListParams({
      from: '2026-05-01',
      to: '2026-01-01',
    });
    expect(result.query.from).toBe('2026-05-01');
    expect(result.ignored).toEqual([]);
  });
});

describe('fuelListHref', () => {
  it('leaves out defaults and keeps filters, limit and overrides', () => {
    expect(fuelListHref('v', { page: 1, limit: 20 })).toBe('/vehicles/v/fuel');
    expect(
      fuelListHref('v', { page: 1, limit: 5, from: '2026-01-01' }, { page: 2 }),
    ).toBe('/vehicles/v/fuel?from=2026-01-01&limit=5&page=2');
  });
});
