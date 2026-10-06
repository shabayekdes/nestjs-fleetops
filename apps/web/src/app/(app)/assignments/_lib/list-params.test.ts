import { describe, expect, it } from 'vitest';
import { assignmentListHref, parseAssignmentListParams } from './list-params';

describe('parseAssignmentListParams', () => {
  it('uses the defaults', () => {
    expect(parseAssignmentListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it('parses active=true and active=false', () => {
    const current = parseAssignmentListParams({ active: 'true' });
    expect(current.query.active).toBe(true);
    expect(current.hasFilters).toBe(true);
    expect(parseAssignmentListParams({ active: 'false' }).query.active).toBe(
      false,
    );
  });

  it('treats an empty active as All and ignores anything else, reporting it', () => {
    expect(parseAssignmentListParams({ active: '' })).toMatchObject({
      ignored: [],
      hasFilters: false,
    });
    const bad = parseAssignmentListParams({ active: 'yes' });
    expect(bad.query.active).toBeUndefined();
    expect(bad.ignored).toEqual(['active']);
    expect(
      parseAssignmentListParams({ active: ['true', 'false'] }).ignored,
    ).toEqual(['active']);
  });

  it('never forwards unknown params', () => {
    expect(
      parseAssignmentListParams({ vehicleId: 'x', notice: 'y' }).query,
    ).toEqual({ page: 1, limit: 20 });
  });
});

describe('assignmentListHref', () => {
  it('keeps the filter and a non-default limit, drops page 1', () => {
    expect(assignmentListHref({ active: false, limit: 5, page: 1 })).toBe(
      '/assignments?active=false&limit=5',
    );
    expect(assignmentListHref({ limit: 20 }, { page: 3 })).toBe(
      '/assignments?page=3',
    );
  });
});
