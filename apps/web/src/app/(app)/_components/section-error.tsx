import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/error-state';
import { NotAllowed } from '@/components/not-allowed';
import { ApiConnectionError, ApiError } from '@/lib/api/errors';

/**
 * What a dashboard section shows when its fetch failed, so one failing section
 * never breaks the others: 403 gives NotAllowed, 5xx and connection errors give
 * a generic ErrorState (with the request id as the reference). Anything else,
 * including the redirect thrown for a missing session, is rethrown.
 */
export function sectionError(error: unknown, title: string): ReactNode {
  if (error instanceof ApiError && error.status === 403) {
    return <NotAllowed />;
  }
  if (
    (error instanceof ApiError && error.status >= 500) ||
    error instanceof ApiConnectionError
  ) {
    return (
      <ErrorState
        title={title}
        reference={
          error instanceof ApiError ? (error.requestId ?? undefined) : undefined
        }
      />
    );
  }
  unstable_rethrow(error);
  throw error;
}
