'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { loginUrl } from '@/lib/auth/return-to';

const CHECK_INTERVAL_MS = 15_000;
const WARN_BEFORE_MS = 120_000;

export type SessionStatus =
  | { kind: 'none' }
  | { kind: 'warning'; minutes: number }
  | { kind: 'expired'; href: string };

const NONE: SessionStatus = { kind: 'none' };
const SessionStatusContext = createContext<SessionStatus>(NONE);

/**
 * Tracks the session deadline in the browser and shares the status with the
 * expiry notice and with forms. Receives only the remaining time, never the
 * token. The browser clock makes this advisory; the API's 401 is the real guard.
 */
export function SessionDeadlineProvider({
  remainingMs,
  children,
}: {
  remainingMs: number;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<SessionStatus>(NONE);

  useEffect(() => {
    const deadline = Date.now() + remainingMs;

    function check() {
      const left = deadline - Date.now();
      if (left <= 0) {
        setStatus({
          kind: 'expired',
          href: loginUrl({
            reason: 'expired',
            returnTo: window.location.pathname + window.location.search,
          }),
        });
      } else if (left <= WARN_BEFORE_MS) {
        setStatus({ kind: 'warning', minutes: Math.ceil(left / 60_000) });
      } else {
        setStatus(NONE);
      }
    }

    const initial = setTimeout(check, 0);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [remainingMs]);

  return (
    <SessionStatusContext.Provider value={status}>
      {children}
    </SessionStatusContext.Provider>
  );
}

/** Without a provider the status is always `none`. */
export function useSessionStatus(): SessionStatus {
  return useContext(SessionStatusContext);
}
