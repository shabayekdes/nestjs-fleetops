import Link from 'next/link';
import { LinkPending } from '@/components/link-pending';
import { Badge } from '@/components/ui/badge';
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

export function AssignmentsTable({
  assignments,
}: {
  assignments: Assignment[];
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Assignments</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Ended</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell>
              <Link
                href={`/vehicles/${assignment.vehicle.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {assignment.vehicle.make} {assignment.vehicle.model}
                <LinkPending className="ml-1 inline" />
              </Link>{' '}
              <span className="text-muted-foreground">
                ({assignment.vehicle.licensePlate ?? assignment.vehicle.vin})
              </span>
            </TableCell>
            <TableCell>
              <Link
                href={`/drivers/${assignment.driver.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {assignment.driver.firstName} {assignment.driver.lastName}
                <LinkPending className="ml-1 inline" />
              </Link>
            </TableCell>
            <TableCell>{formatDateTime(assignment.startedAt)}</TableCell>
            <TableCell>
              {assignment.endedAt ? (
                formatDateTime(assignment.endedAt)
              ) : (
                <Badge variant="secondary">Current</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
