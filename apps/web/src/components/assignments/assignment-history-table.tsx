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
import type { Assignment } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

/** Past assignments. `perspective` is the page they are shown on. */
export function AssignmentHistoryTable({
  assignments,
  perspective,
}: {
  assignments: Assignment[];
  perspective: 'vehicle' | 'driver';
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Past assignments</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>
            {perspective === 'vehicle' ? 'Driver' : 'Vehicle'}
          </TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Ended</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell>
              {perspective === 'vehicle' ? (
                <Link
                  href={`/drivers/${assignment.driver.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {assignment.driver.firstName} {assignment.driver.lastName}
                  <LinkPending className="ml-1 inline" />
                </Link>
              ) : (
                <Link
                  href={`/vehicles/${assignment.vehicle.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {assignment.vehicle.make} {assignment.vehicle.model}
                  <LinkPending className="ml-1 inline" />
                </Link>
              )}
            </TableCell>
            <TableCell>{formatDateTime(assignment.startedAt)}</TableCell>
            <TableCell>
              {assignment.endedAt ? formatDateTime(assignment.endedAt) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
