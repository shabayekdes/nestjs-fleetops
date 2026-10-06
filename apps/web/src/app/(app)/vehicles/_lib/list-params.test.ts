import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  maxVehicleYear,
  parseVehicleListParams,
  vehicleListHref,
} from './list-params';

afterEach(() => {
  vi.useRealTimers();
});

describe('parseVehicleListParams', () => {
  it('uses the defaults', () => {
    expect(parseVehicleListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it('reads valid values', () => {
    const result = parseVehicleListParams({
      page: '3',
      limit: '50',
      make: 'Ford',
      model: 'Transit',
      year: '2021',
    });
    expect(result.query).toEqual({
      page: 3,
      limit: 50,
      make: 'Ford',
      model: 'Transit',
      year: 2021,
    });
    expect(result.hasFilters).toBe(true);
    expect(result.ignored).toEqual([]);
  });

  it('trims text and treats empty as absent without reporting it', () => {
    const result = parseVehicleListParams({
      make: '  Ford  ',
      model: '   ',
      year: '',
    });
    expect(result.query).toEqual({ page: 1, limit: 20, make: 'Ford' });
    expect(result.ignored).toEqual([]);
  });

  it('ignores array values', () => {
    const result = parseVehicleListParams({
      page: ['1', '2'],
      make: ['a', 'b'],
    });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual(['page', 'make']);
  });

  it.each(['0', '-1', '1.5', 'abc', '1e3', '1000001'])(
    'ignores page %j',
    (page) => {
      const result = parseVehicleListParams({ page });
      expect(result.query.page).toBe(1);
      expect(result.ignored).toEqual(['page']);
    },
  );

  it.each([
    ['0', false],
    ['101', false],
    ['1', true],
    ['100', true],
  ])('limit %s accepted: %s', (limit, ok) => {
    const result = parseVehicleListParams({ limit });
    expect(result.ignored).toEqual(ok ? [] : ['limit']);
    expect(result.query.limit).toBe(ok ? Number(limit) : 20);
  });

  it('checks year against the current UTC year plus one', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    expect(maxVehicleYear()).toBe(2027);
    expect(parseVehicleListParams({ year: '2027' }).query.year).toBe(2027);
    expect(parseVehicleListParams({ year: '1900' }).query.year).toBe(1900);
    expect(parseVehicleListParams({ year: '2028' }).ignored).toEqual(['year']);
    expect(parseVehicleListParams({ year: '1899' }).ignored).toEqual(['year']);
    expect(parseVehicleListParams({ year: '20x1' }).ignored).toEqual(['year']);
  });

  it('ignores a 51-character make but keeps 50', () => {
    expect(parseVehicleListParams({ make: 'a'.repeat(51) }).ignored).toEqual([
      'make',
    ]);
    expect(parseVehicleListParams({ make: 'a'.repeat(50) }).ignored).toEqual(
      [],
    );
  });

  it('does not report unknown params such as notice', () => {
    expect(
      parseVehicleListParams({ notice: 'vehicle-deleted', foo: 'x' }).ignored,
    ).toEqual([]);
  });
});

describe('vehicleListHref', () => {
  it('leaves out defaults and empty filters', () => {
    expect(vehicleListHref({ page: 1, limit: 20 })).toBe('/vehicles');
  });

  it('keeps filters and a non-default limit', () => {
    expect(
      vehicleListHref({ page: 1, limit: 2, make: 'Ford', year: 2021 }),
    ).toBe('/vehicles?make=Ford&year=2021&limit=2');
  });

  it('applies overrides', () => {
    expect(
      vehicleListHref({ page: 1, limit: 20, make: 'Ford' }, { page: 3 }),
    ).toBe('/vehicles?make=Ford&page=3');
  });
});
