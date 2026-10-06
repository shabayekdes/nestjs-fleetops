'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Refreshes the router once when it first appears. Shared layouts are not
 * re-rendered on client navigation, so after a 403 (the role may have changed)
 * this makes the navigation and user menu load fresh data.
 */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    // Once per mount; `router` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
