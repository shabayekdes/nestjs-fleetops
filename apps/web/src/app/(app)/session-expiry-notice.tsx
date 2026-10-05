'use client';

import { useEffect, useState } from 'react';
import { loginUrl } from '@/lib/auth/return-to';

const CHECK_INTERVAL_MS = 15_000;
const WARN_BEFORE_MS = 120_000;

type NoticeState =
  | { kind: 'none' }
  | { kind: 'warning'; minutes: number }
  | { kind: 'expired'; href: string };

/**
 * Warns before the session ends and links to login once it has. Receives only
 * the remaining time, never the token.
 */
export function SessionExpiryNotice({ remainingMs }: { remainingMs: number }) {
  const [state, setState] = useState<NoticeState>({ kind: 'none' });

  useEffect(() => {
    const deadline = Date.now() + remainingMs;

    function check() {
      const left = deadline - Date.now();
      if (left <= 0) {
        setState({
          kind: 'expired',
          href: loginUrl({
            reason: 'expired',
            returnTo: window.location.pathname + window.location.search,
          }),
        });
      } else if (left <= WARN_BEFORE_MS) {
        setState({ kind: 'warning', minutes: Math.ceil(left / 60_000) });
      } else {
        setState({ kind: 'none' });
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

  if (state.kind === 'warning') {
    return (
      <p role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Your session expires in about {state.minutes}{' '}
        {state.minutes === 1 ? 'minute' : 'minutes'}. Save your work; you will
        need to sign in again.
      </p>
    );
  }
  if (state.kind === 'expired') {
    return (
      <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-900">
        Your session has expired.{' '}
        <a href={state.href} className="underline">
          Sign in again
        </a>{' '}
        to continue; unsubmitted changes will be lost.
      </p>
    );
  }
  return null;
}
