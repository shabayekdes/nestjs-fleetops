import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
