'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkPending } from '@/components/link-pending';
import type { Role } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import {
  NAV_ITEMS,
  isNavItemActive,
  visibleNavItems,
  type NavItem,
} from './nav-items';

export function SidebarNav({
  role,
  items = NAV_ITEMS,
  onNavigate,
}: {
  role: Role;
  items?: readonly NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {visibleNavItems(items, role).map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'focus-visible:ring-ring/50 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-[3px]',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.label}
                <LinkPending className="ml-auto" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
