import Link from 'next/link';
import { LinkPending } from '@/components/link-pending';
import { buildHref } from '@/lib/search-params';

type Params = Record<string, string | number | undefined>;

function PageLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  const className =
    'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium';
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} text-muted-foreground opacity-50`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={`${className} hover:bg-accent`}>
      {label}
      <LinkPending />
    </Link>
  );
}

/**
 * Previous/Next links plus the visible range. `params` are the other search
 * params to keep (filters, a non-default limit); the page param is added here.
 */
export function Pagination({
  page,
  limit,
  total,
  pathname,
  params,
  pageParam = 'page',
}: {
  page: number;
  limit: number;
  total: number;
  pathname: string;
  params: Params;
  /** The search param that holds the page; a second list on one page needs its own. */
  pageParam?: string;
}) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  const hrefFor = (target: number) =>
    buildHref(pathname, {
      ...params,
      [pageParam]: target === 1 ? undefined : target,
    });

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-muted-foreground text-sm">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink
          label="Previous"
          href={hrefFor(page - 1)}
          disabled={page <= 1}
        />
        <span className="text-sm">
          Page {page} of {pageCount}
        </span>
        <PageLink
          label="Next"
          href={hrefFor(page + 1)}
          disabled={page >= pageCount}
        />
      </div>
    </nav>
  );
}
