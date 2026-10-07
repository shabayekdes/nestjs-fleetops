import Link from 'next/link';

export type VehicleSection = 'overview' | 'maintenance' | 'fuel' | 'costs';

/**
 * Links between a vehicle's pages. Render it only for users who can open the
 * maintenance, fuel and cost pages (`canManageVehicleRecords`).
 */
export function VehicleSectionNav({
  vehicleId,
  current,
}: {
  vehicleId: string;
  current: VehicleSection;
}) {
  const base = `/vehicles/${vehicleId}`;
  const items: { key: VehicleSection; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: base },
    { key: 'maintenance', label: 'Maintenance', href: `${base}/maintenance` },
    { key: 'fuel', label: 'Fuel', href: `${base}/fuel` },
    { key: 'costs', label: 'Costs', href: `${base}/costs` },
  ];
  return (
    <nav aria-label="Vehicle sections" className="mb-6 border-b">
      <ul className="-mb-px flex flex-wrap gap-4 text-sm">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.key === current ? 'page' : undefined}
              className={
                item.key === current
                  ? 'inline-block border-b-2 border-foreground py-2 font-medium'
                  : 'text-muted-foreground hover:text-foreground inline-block border-b-2 border-transparent py-2'
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
