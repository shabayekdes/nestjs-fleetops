'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/auth/actions';
import { formatRole } from '@/lib/auth/roles';
import type { ShellUser } from './shell-user';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`Account menu, ${user.name}`}>
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-xs"
          >
            {initials(user.name)}
          </span>
          <span className="hidden sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          <p className="font-medium">{user.name}</p>
          <p className="text-muted-foreground text-xs">{user.email}</p>
          <p className="text-muted-foreground text-xs">
            {formatRole(user.role)}
          </p>
          <p className="text-muted-foreground text-xs">
            {user.organizationName}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await logout();
            });
          }}
        >
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
