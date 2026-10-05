import Link from 'next/link';
import { NOT_ALLOWED_MESSAGE } from '@/lib/auth/messages';

/** Shown when the API answers 403. Never logs the user out. */
export function NotAllowed() {
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4">
      <p className="font-medium text-red-800">{NOT_ALLOWED_MESSAGE}</p>
      <Link href="/" className="mt-2 inline-block text-sm underline">
        Back to home
      </Link>
    </div>
  );
}
