'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      message="An unexpected error occurred. Please try again."
      reference={error.digest}
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
