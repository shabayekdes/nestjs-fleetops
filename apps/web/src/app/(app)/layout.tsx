import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { SESSION_EXPIRY_SKEW_MS, getSession } from '@/lib/auth/session';
import { SessionExpiryNotice } from './session-expiry-notice';
import { SignOutButton } from './sign-out-button';

function remainingMs(expiresAt: number | undefined): number {
  if (expiresAt === undefined) return 0;
  return Math.max(0, expiresAt - SESSION_EXPIRY_SKEW_MS - Date.now());
}

// Minimal bar for FE2; FE3 replaces it with the real application shell.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const session = await getSession();

  return (
    <>
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="font-semibold">FleetOps</span>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.firstName} {user.lastName}{' '}
            <span className="text-gray-600">{user.role}</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      <SessionExpiryNotice
        key={session?.expiresAt}
        remainingMs={remainingMs(session?.expiresAt)}
      />
      {children}
    </>
  );
}
