import {
  ArrowLeftRight,
  IdCard,
  LayoutDashboard,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/api/types';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see the link. Omitted means everyone. Usability only. */
  roles?: readonly Role[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vehicles', label: 'Vehicles', icon: Truck },
  {
    href: '/drivers',
    label: 'Drivers',
    icon: IdCard,
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    href: '/assignments',
    label: 'Assignments',
    icon: ArrowLeftRight,
    roles: ['ADMIN', 'MANAGER'],
  },
  { href: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

export function visibleNavItems(
  items: readonly NavItem[],
  role: Role,
): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
