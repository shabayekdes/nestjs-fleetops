import type { ReactNode } from 'react';
import { SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/auth/messages';

/** Takes display strings only, never a raw error object. */
export function ErrorState({
  title = 'Something went wrong',
  message = SERVICE_UNAVAILABLE_MESSAGE,
  reference,
  action,
}: {
  title?: string;
  message?: string;
  reference?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 rounded-lg border p-6"
    >
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{message}</p>
      {reference ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Reference: {reference}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
