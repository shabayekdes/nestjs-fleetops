import { Badge } from '@/components/ui/badge';
import { licenseStatus } from '@/lib/license-status';

/**
 * A text badge for an expired or soon-to-expire license; nothing when the
 * license is valid. The status is always in words, never colour alone.
 * Display only: it never gates an action (see lib/license-status.ts).
 */
export function LicenseStatusBadge({
  expiresOn,
  now,
}: {
  expiresOn: string;
  now?: Date;
}) {
  const status = licenseStatus(expiresOn, now);
  if (status === 'expired') return <Badge variant="destructive">Expired</Badge>;
  if (status === 'expiring') {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-900"
      >
        Expires soon
      </Badge>
    );
  }
  return null;
}
