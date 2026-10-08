'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pending hint for the `<Link>` it is rendered in. Always occupies its space
 * (no layout shift) and only fades in while the navigation is pending. The
 * spin stops under `prefers-reduced-motion`, leaving a static icon.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden="true"
      data-pending={pending ? 'true' : 'false'}
      className={cn(
        'size-3.5 shrink-0 transition-opacity',
        pending ? 'opacity-100 motion-safe:animate-spin' : 'opacity-0',
        className,
      )}
    />
  );
}
