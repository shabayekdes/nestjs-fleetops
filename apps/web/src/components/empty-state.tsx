import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
