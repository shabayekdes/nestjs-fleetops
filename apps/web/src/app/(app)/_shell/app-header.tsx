import { MobileNav } from './mobile-nav';
import type { ShellUser } from './shell-user';
import { UserMenu } from './user-menu';

export function AppHeader({ user }: { user: ShellUser }) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4">
      <MobileNav role={user.role} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        {user.organizationName}
      </p>
      <UserMenu user={user} />
    </header>
  );
}
