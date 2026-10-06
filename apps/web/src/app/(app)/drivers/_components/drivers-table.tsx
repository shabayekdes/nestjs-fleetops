import Link from 'next/link';
import { LicenseStatusBadge } from '@/components/license-status-badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Driver } from '@/lib/api/types';
import { formatDateOnly } from '@/lib/format';

export function DriversTable({ drivers }: { drivers: Driver[] }) {
  return (
    <Table>
      <TableCaption className="sr-only">Drivers</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>License number</TableHead>
          <TableHead>License expires</TableHead>
          <TableHead>Login account</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {drivers.map((driver) => (
          <TableRow key={driver.id}>
            <TableCell>
              <Link
                href={`/drivers/${driver.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {driver.firstName} {driver.lastName}
              </Link>
            </TableCell>
            <TableCell className="font-mono">{driver.licenseNumber}</TableCell>
            <TableCell>
              <span className="mr-2">
                {formatDateOnly(driver.licenseExpiresOn)}
              </span>
              <LicenseStatusBadge expiresOn={driver.licenseExpiresOn} />
            </TableCell>
            <TableCell>{driver.userId ? 'Linked' : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
