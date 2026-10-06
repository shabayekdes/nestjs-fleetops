import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type NoticeVariant = 'info' | 'success' | 'warning' | 'error';

const STYLES: Record<NoticeVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

/** Inline, non-dismissible message. Errors and warnings are announced as alerts. */
export function Notice({
  variant,
  children,
}: {
  variant: NoticeVariant;
  children: ReactNode;
}) {
  const role =
    variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  return (
    <div
      role={role}
      data-variant={variant}
      className={cn('rounded-md border px-3 py-2 text-sm', STYLES[variant])}
    >
      {children}
    </div>
  );
}
