'use client';

import { useSessionStatus } from '@/components/session-deadline';

/** Warns before the session ends and links to login once it has. */
export function SessionExpiryNotice() {
  const state = useSessionStatus();

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
