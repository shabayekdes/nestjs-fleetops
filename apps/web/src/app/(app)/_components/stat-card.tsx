import Link from 'next/link';
import type { ReactNode } from 'react';

const CARD = 'rounded-lg border p-4';
const LINK =
  'underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2';

/** One headline number that links to the page where it can be explored. */
export function StatCard({
  label,
  value,
  href,
  detail,
}: {
  label: string;
  value: number | string;
  href: string;
  detail?: string;
}) {
  return (
    <div className={CARD}>
      <h3 className="text-muted-foreground text-sm">
        <Link href={href} className={LINK}>
          {label}
        </Link>
      </h3>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {detail ? (
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      ) : null}
    </div>
  );
}

/** A card with several counts, each linking to a filtered list. */
export function StatListCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; href: string }[];
}): ReactNode {
  return (
    <div className={CARD}>
      <h3 className="text-muted-foreground text-sm">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.href} className="flex justify-between gap-4">
            <Link href={item.href} className={LINK}>
              {item.label}
            </Link>
            <span className="font-medium tabular-nums">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
