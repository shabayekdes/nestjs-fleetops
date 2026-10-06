// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: pathname }));

import { SidebarNav } from './sidebar-nav';
import type { NavItem } from './nav-items';

const items: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: LayoutDashboard, roles: ['ADMIN'] },
];

describe('SidebarNav', () => {
  it('renders a nav named Main with aria-current on the active link only', () => {
    pathname.mockReturnValue('/users/5');
    render(<SidebarNav role="ADMIN" items={items} />);
    expect(
      screen.getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('hides ADMIN-only items from a DRIVER', () => {
    pathname.mockReturnValue('/');
    render(<SidebarNav role="DRIVER" items={items} />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  });

  it('calls onNavigate when a link is clicked', () => {
    pathname.mockReturnValue('/');
    const onNavigate = vi.fn();
    render(<SidebarNav role="ADMIN" items={items} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
