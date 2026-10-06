import Link from 'next/link';
import {
  Table,
  TableCaption,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Vehicle } from '@/lib/api/types';

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
              </Link>
            </TableCell>
            <TableCell>{vehicle.model}</TableCell>
            <TableCell>{vehicle.year}</TableCell>
            <TableCell className="font-mono">{vehicle.vin}</TableCell>
            <TableCell>{vehicle.licensePlate ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
