import { Badge } from '@/components/ui/badge';
import type { LicenseStatus } from '@/lib/api/types';
import { LICENSE_STATUS_LABELS } from '@/lib/license-status';

/**
 * A text badge for an expired or soon-to-expire license; nothing when the
 * license is valid. The status is always in words, never colour alone. It
 * comes from the API and is never recomputed here.
 */
export function LicenseStatusBadge({ status }: { status: LicenseStatus }) {
  const label = LICENSE_STATUS_LABELS[status];
  if (status === 'EXPIRED') return <Badge variant="destructive">{label}</Badge>;
  if (status === 'EXPIRING_SOON') {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-900"
      >
        {label}
      </Badge>
    );
  }
  return null;
}
