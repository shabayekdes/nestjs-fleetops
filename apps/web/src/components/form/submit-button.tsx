'use client';

import { useFormStatus } from 'react-dom';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';

export const SESSION_EXPIRED_SAVE_MESSAGE =
  'Your session has expired. Sign in again to save.';

/**
 * Submit button for a form. Disabled while the form is submitting and once the
 * session has expired (advisory: the server answers 401 either way).
 */
export function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  const session = useSessionStatus();
  const expired = session.kind === 'expired';

  return (
    <>
      <Button
        type="submit"
        disabled={pending || expired}
        aria-describedby={expired ? 'session-expired-hint' : undefined}
      >
        {pending ? pendingLabel : label}
      </Button>
      {expired ? (
        <span id="session-expired-hint" className="text-destructive text-sm">
          {SESSION_EXPIRED_SAVE_MESSAGE}
        </span>
      ) : null}
    </>
  );
}
