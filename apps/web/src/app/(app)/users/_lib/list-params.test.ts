import { describe, expect, it } from 'vitest';
import {
  parseUserListParams,
  userListHref,
  userListParams,
} from './list-params';

describe('parseUserListParams', () => {
  it('uses the defaults', () => {
    expect(parseUserListParams({})).toEqual({
      query: { page: 1, limit: 20 },
      ignored: [],
      hasFilters: false,
    });
  });

  it.each(['ADMIN', 'MANAGER', 'DRIVER'] as const)('accepts %s', (role) => {
    const result = parseUserListParams({ role, page: '2', limit: '50' });
    expect(result.query).toEqual({ page: 2, limit: 50, role });
    expect(result.hasFilters).toBe(true);
    expect(result.ignored).toEqual([]);
  });

  it.each(['admin', 'ROOT', 'Admin'])(
    'ignores role=%s and reports it',
    (role) => {
      const result = parseUserListParams({ role });
      expect(result.query).toEqual({ page: 1, limit: 20 });
      expect(result.ignored).toEqual(['role']);
      expect(result.hasFilters).toBe(false);
    },
  );

  it('ignores a repeated role', () => {
    const result = parseUserListParams({ role: ['ADMIN', 'DRIVER'] });
    expect(result.query.role).toBeUndefined();
    expect(result.ignored).toEqual(['role']);
  });

  it('treats an empty role as absent', () => {
    const result = parseUserListParams({ role: '' });
    expect(result.ignored).toEqual([]);
    expect(result.hasFilters).toBe(false);
  });

  it('drops unknown params and notice silently', () => {
    const result = parseUserListParams({ notice: 'user-created', foo: 'bar' });
    expect(result.query).toEqual({ page: 1, limit: 20 });
    expect(result.ignored).toEqual([]);
  });

  it('reports invalid page and limit', () => {
    const result = parseUserListParams({ page: '0', limit: '500' });
    expect(result.ignored).toEqual(['page', 'limit']);
    expect(result.query).toEqual({ page: 1, limit: 20 });
  });
});

describe('userListHref', () => {
  it('leaves out the defaults', () => {
    expect(userListHref({ page: 1, limit: 20 })).toBe('/users');
  });

  it('keeps role and a non-default limit and page', () => {
    expect(userListHref({ role: 'MANAGER', limit: 5, page: 3 })).toBe(
      '/users?role=MANAGER&limit=5&page=3',
    );
  });

  it('applies overrides', () => {
    expect(userListHref({ role: 'DRIVER', page: 1 }, { page: 4 })).toBe(
      '/users?role=DRIVER&page=4',
    );
  });
});

describe('userListParams', () => {
  it('maps the query to link params', () => {
    expect(userListParams({ role: 'ADMIN', limit: 20, page: 1 })).toEqual({
      role: 'ADMIN',
      limit: undefined,
      page: undefined,
    });
  });
});
