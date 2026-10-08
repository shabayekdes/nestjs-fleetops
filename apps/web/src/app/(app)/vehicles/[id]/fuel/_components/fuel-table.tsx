import Link from 'next/link';
import { LinkPending } from '@/components/link-pending';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FuelLog } from '@/lib/api/types';
import { formatDateOnly, formatDecimal, formatKm } from '@/lib/format';
import { DeleteFuelButton } from './delete-fuel-button';

export function FuelTable({
  vehicleId,
  logs,
}: {
  vehicleId: string;
  logs: FuelLog[];
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Fuel logs</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Liters</TableHead>
          <TableHead className="text-right">Total cost</TableHead>
          <TableHead>Odometer</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => {
          const summary = `Fuel log of ${formatDateOnly(log.fueledOn)}`;
          return (
            <TableRow key={log.id}>
              <TableCell>{formatDateOnly(log.fueledOn)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDecimal(log.liters, 3)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDecimal(log.totalCost, 2)}
              </TableCell>
              <TableCell>
                {log.odometerKm === null ? '—' : formatKm(log.odometerKm)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/vehicles/${vehicleId}/fuel/${log.id}/edit`}
                    aria-label={`Edit ${summary}`}
                    className="text-sm underline underline-offset-4"
                  >
                    Edit
                    <LinkPending className="ml-1 inline" />
                  </Link>
                  <DeleteFuelButton
                    vehicleId={vehicleId}
                    recordId={log.id}
                    summary={summary}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
