import Link from 'next/link';
import { LinkPending } from '@/components/link-pending';
import {
  Table,
  TableCaption,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ServiceStatusBadge } from '@/components/service-status-badge';
import type { Vehicle } from '@/lib/api/types';
import { formatDateOnly } from '@/lib/format';

export function VehiclesTable({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <Table>
      <TableCaption className="sr-only">Vehicles</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Make</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Year</TableHead>
          <TableHead>VIN</TableHead>
          <TableHead>License plate</TableHead>
          <TableHead>Service</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.map((vehicle) => (
          <TableRow key={vehicle.id}>
            <TableCell>
              <Link
                href={`/vehicles/${vehicle.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {vehicle.make}
                <LinkPending className="ml-1 inline" />
              </Link>
            </TableCell>
            <TableCell>{vehicle.model}</TableCell>
            <TableCell>{vehicle.year}</TableCell>
            <TableCell className="font-mono">{vehicle.vin}</TableCell>
            <TableCell>{vehicle.licensePlate ?? '—'}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <ServiceStatusBadge status={vehicle.serviceStatus} />
                {vehicle.nextServiceDueOn ? (
                  <span className="text-muted-foreground text-sm">
                    {formatDateOnly(vehicle.nextServiceDueOn)}
                  </span>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
