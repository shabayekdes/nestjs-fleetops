import { describe, expect, it } from 'vitest';
import {
  maintenanceListHref,
  maintenanceListParams,
  parseMaintenanceListParams,
} from './list-params';

describe('parseMaintenanceListParams', () => {
  it('uses the defaults', () => {
    expect(parseMaintenanceListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it('reads valid values', () => {
    const result = parseMaintenanceListParams({
      page: '2',
      limit: '50',
      type: 'BRAKES',
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(result.query).toEqual({
      page: 2,
      limit: 50,
      type: 'BRAKES',
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(result.hasFilters).toBe(true);
    expect(result.ignored).toEqual([]);
  });

  it('drops invalid values leniently and reports them', () => {
    const result = parseMaintenanceListParams({
      page: '0',
      limit: '500',
      type: 'WASH',
      from: '2026-02-30',
      to: ['2026-01-01', '2026-01-02'],
    });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.hasFilters).toBe(false);
    expect(result.ignored).toEqual(['page', 'limit', 'type', 'from', 'to']);
  });

  it('treats empty values as absent without a warning', () => {
    const result = parseMaintenanceListParams({ type: '', from: '', to: '' });
    expect(result.ignored).toEqual([]);
    expect(result.hasFilters).toBe(false);
  });

  it('does not check from against to and ignores unknown params', () => {
    const result = parseMaintenanceListParams({
      from: '2026-05-01',
      to: '2026-01-01',
      notice: 'maintenance-created',
    });
    expect(result.query.from).toBe('2026-05-01');
    expect(result.query.to).toBe('2026-01-01');
    expect(result.ignored).toEqual([]);
  });
});

describe('maintenanceListHref', () => {
  const ID = 'vid';

  it('leaves out defaults and empty filters', () => {
    expect(maintenanceListHref(ID, { page: 1, limit: 20 })).toBe(
      '/vehicles/vid/maintenance',
    );
  });

  it('keeps the filters and a non-default limit', () => {
    expect(
      maintenanceListHref(ID, {
        page: 1,
        limit: 5,
        type: 'TIRES',
        from: '2026-01-01',
      }),
    ).toBe('/vehicles/vid/maintenance?type=TIRES&from=2026-01-01&limit=5');
  });

  it('applies overrides', () => {
    expect(
      maintenanceListHref(
        ID,
        { page: 1, limit: 20, type: 'TIRES' },
        { page: 4 },
      ),
    ).toBe('/vehicles/vid/maintenance?type=TIRES&page=4');
    expect(maintenanceListParams({ page: 3, limit: 20 })).toMatchObject({
      page: 3,
      limit: undefined,
    });
  });
});
