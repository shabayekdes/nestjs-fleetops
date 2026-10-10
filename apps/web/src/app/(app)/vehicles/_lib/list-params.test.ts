import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  maxVehicleYear,
  parseVehicleListParams,
  vehicleListHref,
} from './list-params';

afterEach(() => {
  vi.useRealTimers();
});

const MAKE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const MODEL_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const TYPE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';

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
      makeId: MAKE_ID,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
      year: '2021',
    });
    expect(result.query).toEqual({
      page: 3,
      limit: 50,
      makeId: MAKE_ID,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
      year: 2021,
    });
    expect(result.hasFilters).toBe(true);
    expect(result.ignored).toEqual([]);
  });

  it('trims text and treats empty as absent without reporting it', () => {
    const result = parseVehicleListParams({
      makeId: `  ${MAKE_ID}  `,
      modelId: '   ',
      vehicleTypeId: '',
      year: '',
    });
    expect(result.query).toEqual({ page: 1, limit: 20, makeId: MAKE_ID });
    expect(result.ignored).toEqual([]);
  });

  it('ignores array values', () => {
    const result = parseVehicleListParams({
      page: ['1', '2'],
      makeId: [MAKE_ID, MODEL_ID],
    });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual(['page', 'makeId']);
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

  it.each(['makeId', 'modelId', 'vehicleTypeId'])(
    'drops an invalid %s and reports it',
    (name) => {
      const result = parseVehicleListParams({ [name]: 'toyota' });
      expect(result.query).toEqual({ page: 1, limit: 20 });
      expect(result.hasFilters).toBe(false);
      expect(result.ignored).toEqual([name]);
    },
  );

  it('ignores the old free-text make and model params silently', () => {
    const result = parseVehicleListParams({ make: 'Ford', model: 'Transit' });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual([]);
  });

  it('counts a catalog id as a filter', () => {
    expect(parseVehicleListParams({ vehicleTypeId: TYPE_ID }).hasFilters).toBe(
      true,
    );
  });

  it('reads a valid serviceStatus as a filter', () => {
    const result = parseVehicleListParams({ serviceStatus: 'OVERDUE' });
    expect(result.query.serviceStatus).toBe('OVERDUE');
    expect(result.hasFilters).toBe(true);
    expect(result.ignored).toEqual([]);
  });

  it.each(['overdue', 'LATE', ['OK', 'OVERDUE']])(
    'ignores serviceStatus %j',
    (serviceStatus) => {
      const result = parseVehicleListParams({ serviceStatus });
      expect(result.query.serviceStatus).toBeUndefined();
      expect(result.hasFilters).toBe(false);
      expect(result.ignored).toEqual(['serviceStatus']);
    },
  );

  it('treats an empty serviceStatus as absent without a warning', () => {
    const result = parseVehicleListParams({ serviceStatus: '' });
    expect(result.query.serviceStatus).toBeUndefined();
    expect(result.ignored).toEqual([]);
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
      vehicleListHref({
        page: 1,
        limit: 2,
        makeId: MAKE_ID,
        modelId: MODEL_ID,
        vehicleTypeId: TYPE_ID,
        year: 2021,
      }),
    ).toBe(
      `/vehicles?makeId=${MAKE_ID}&modelId=${MODEL_ID}&vehicleTypeId=${TYPE_ID}&year=2021&limit=2`,
    );
  });

  it('keeps the serviceStatus filter', () => {
    expect(
      vehicleListHref({ page: 1, limit: 20, serviceStatus: 'DUE_SOON' }),
    ).toBe('/vehicles?serviceStatus=DUE_SOON');
  });

  it('applies overrides', () => {
    expect(
      vehicleListHref({ page: 1, limit: 20, makeId: MAKE_ID }, { page: 3 }),
    ).toBe(`/vehicles?makeId=${MAKE_ID}&page=3`);
  });
});
