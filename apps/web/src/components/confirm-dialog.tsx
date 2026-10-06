'use client';

import { useState, useTransition, type ReactElement } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Notice } from '@/components/notice';

type ConfirmResult = { error?: string } | void;

/**
 * Confirmation built on AlertDialog. onConfirm may be a Server Action; a
 * redirect it throws is deliberately not caught.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<ConfirmResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setError(null);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Notice variant="error">{error}</Notice> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await onConfirm();
                if (result && result.error) {
                  setError(result.error);
                } else {
                  setOpen(false);
                }
              });
            }}
          >
            {pending ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
