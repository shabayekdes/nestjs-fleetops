'use client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSessionStatus } from '@/components/session-deadline';
import { Button } from '@/components/ui/button';
import { deleteUser } from '../actions';

const SELF_HINT_ID = 'delete-self-hint';

export function DeleteUserButton({
  id,
  name,
  email,
  isSelf,
}: {
  id: string;
  name: string;
  email: string;
  isSelf: boolean;
}) {
  const expired = useSessionStatus().kind === 'expired';

  return (
    <>
      <ConfirmDialog
        trigger={
          <Button
            variant="destructive"
            disabled={expired || isSelf}
            aria-describedby={isSelf ? SELF_HINT_ID : undefined}
          >
            Delete
          </Button>
        }
        title="Delete this user?"
        description={`${name} (${email}) will be deleted and can no longer sign in. A driver record linked to this account is kept but unlinked. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteUser(id)}
      />
      {isSelf ? (
        <span id={SELF_HINT_ID} className="text-muted-foreground text-sm">
          You cannot delete your own account.
        </span>
      ) : null}
    </>
  );
}
