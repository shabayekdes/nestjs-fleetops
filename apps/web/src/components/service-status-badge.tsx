import { Badge } from '@/components/ui/badge';
import type { ServiceStatus } from '@/lib/api/types';
import { SERVICE_STATUS_LABELS } from '@/lib/service-status';

/**
 * The vehicle's service status in words, never colour alone. The status comes
 * from the API and is never recomputed here.
 */
export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const label = SERVICE_STATUS_LABELS[status];
  if (status === 'OVERDUE') return <Badge variant="destructive">{label}</Badge>;
  if (status === 'DUE_SOON') {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-900"
      >
        {label}
      </Badge>
    );
  }
  if (status === 'OK') return <Badge variant="outline">{label}</Badge>;
  return <span className="text-muted-foreground text-sm">{label}</span>;
}
