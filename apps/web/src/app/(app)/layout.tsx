import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { SESSION_EXPIRY_SKEW_MS, getSession } from '@/lib/auth/session';
import { AppHeader } from './_shell/app-header';
import { SidebarNav } from './_shell/sidebar-nav';
import { toShellUser } from './_shell/shell-user';
import { SessionExpiryNotice } from './session-expiry-notice';

function remainingMs(expiresAt: number | undefined): number {
  if (expiresAt === undefined) return 0;
  return Math.max(0, expiresAt - SESSION_EXPIRY_SKEW_MS - Date.now());
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const session = await getSession();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main-content"
        className="bg-background focus:ring-ring sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
      >
        Skip to content
      </a>
      <aside className="hidden border-r lg:block">
        <div className="sticky top-0 p-4">
          <p className="mb-6 px-3 text-lg font-semibold">FleetOps</p>
          <SidebarNav role={user.role} />
        </div>
      </aside>
      <div className="min-w-0">
        <AppHeader user={toShellUser(user)} />
        <SessionExpiryNotice
          key={session?.expiresAt}
          remainingMs={remainingMs(session?.expiresAt)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="p-4 outline-none lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
