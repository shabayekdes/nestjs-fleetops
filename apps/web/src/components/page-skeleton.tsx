import { Skeleton } from '@/components/ui/skeleton';

export type PageSkeletonVariant = 'list' | 'detail' | 'form';

/**
 * Route-level loading placeholder. `list` (default): title and full-width
 * rows; `detail`: title and label/value pairs; `form`: title and stacked
 * fields with a button.
 */
export function PageSkeleton({
  rows = 5,
  variant = 'list',
}: {
  rows?: number;
  variant?: PageSkeletonVariant;
}) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-48" />
      {variant === 'detail' ? (
        <div className="grid max-w-xl grid-cols-[8rem_1fr] gap-x-8 gap-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="contents">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : variant === 'form' ? (
        <div className="max-w-xl space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-24" />
        </div>
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))
      )}
    </div>
  );
}
