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
import type { MaintenanceRecord } from '@/lib/api/types';
import { formatDateOnly, formatDecimal, formatKm } from '@/lib/format';
import { MAINTENANCE_TYPE_LABELS } from '../_lib/maintenance-types';
import { DeleteMaintenanceButton } from './delete-maintenance-button';

export function MaintenanceTable({
  vehicleId,
  records,
}: {
  vehicleId: string;
  records: MaintenanceRecord[];
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Maintenance records</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Odometer</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead>Next service due</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const summary = `${MAINTENANCE_TYPE_LABELS[record.type]} on ${formatDateOnly(record.performedOn)}`;
          return (
            <TableRow key={record.id}>
              <TableCell>{formatDateOnly(record.performedOn)}</TableCell>
              <TableCell>{MAINTENANCE_TYPE_LABELS[record.type]}</TableCell>
              <TableCell className="max-w-xs whitespace-normal">
                {record.description ?? '—'}
              </TableCell>
              <TableCell>{record.vendor ?? '—'}</TableCell>
              <TableCell>
                {record.odometerKm === null ? '—' : formatKm(record.odometerKm)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDecimal(record.cost, 2)}
              </TableCell>
              <TableCell>
                {record.nextServiceDueOn
                  ? formatDateOnly(record.nextServiceDueOn)
                  : '—'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/vehicles/${vehicleId}/maintenance/${record.id}/edit`}
                    aria-label={`Edit ${summary}`}
                    className="text-sm underline underline-offset-4"
                  >
                    Edit
                    <LinkPending className="ml-1 inline" />
                  </Link>
                  <DeleteMaintenanceButton
                    vehicleId={vehicleId}
                    recordId={record.id}
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
