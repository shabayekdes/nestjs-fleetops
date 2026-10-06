import Link from 'next/link';
import { Notice } from '@/components/notice';
import { RefreshOnMount } from '@/components/refresh-on-mount';
import { NOT_ALLOWED_MESSAGE } from '@/lib/auth/messages';

/**
 * Shown when the API answers 403 (or the role cannot use the page). Never logs
 * the user out. It refreshes the router so a stale navigation is replaced.
 */
export function NotAllowed() {
  return (
    <div className="space-y-2">
      <Notice variant="error">{NOT_ALLOWED_MESSAGE}</Notice>
      <Link href="/" className="inline-block text-sm underline">
        Back to home
      </Link>
      <RefreshOnMount />
    </div>
  );
}
