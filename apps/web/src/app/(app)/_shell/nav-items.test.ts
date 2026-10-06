import { LayoutDashboard } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  isNavItemActive,
  visibleNavItems,
  type NavItem,
} from './nav-items';

const items: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: LayoutDashboard, roles: ['ADMIN'] },
];

describe('visibleNavItems', () => {
  it('shows items without roles to everyone', () => {
    for (const role of ['ADMIN', 'MANAGER', 'DRIVER'] as const) {
      expect(visibleNavItems(items, role)[0]?.label).toBe('Dashboard');
    }
  });

  it('hides an ADMIN-only item from other roles', () => {
    expect(visibleNavItems(items, 'ADMIN').map((i) => i.label)).toEqual([
      'Dashboard',
      'Users',
    ]);
    expect(visibleNavItems(items, 'MANAGER').map((i) => i.label)).toEqual([
      'Dashboard',
    ]);
    expect(visibleNavItems(items, 'DRIVER').map((i) => i.label)).toEqual([
      'Dashboard',
    ]);
  });
});

describe('NAV_ITEMS', () => {
  it('contains Dashboard and Vehicles', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Dashboard', 'Vehicles']);
  });

  it('shows Vehicles to every role', () => {
    for (const role of ['ADMIN', 'MANAGER', 'DRIVER'] as const) {
      expect(visibleNavItems(NAV_ITEMS, role).map((i) => i.label)).toContain(
        'Vehicles',
      );
    }
  });
});

describe('isNavItemActive', () => {
  it('matches / only exactly', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/vehicles', '/')).toBe(false);
  });

  it('matches nested paths on a segment boundary', () => {
    expect(isNavItemActive('/vehicles', '/vehicles')).toBe(true);
    expect(isNavItemActive('/vehicles/123', '/vehicles')).toBe(true);
    expect(isNavItemActive('/vehicles-archive', '/vehicles')).toBe(false);
  });
});
