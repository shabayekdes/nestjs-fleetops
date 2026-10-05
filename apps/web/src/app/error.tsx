'use client';

import { useEffect } from 'react';

export default function ErrorPage({
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
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-gray-600">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest ? (
        <p className="mt-2 text-sm text-gray-500">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </main>
  );
}
