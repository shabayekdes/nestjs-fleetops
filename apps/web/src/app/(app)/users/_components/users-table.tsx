import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { User } from '@/lib/api/types';
import { formatRole } from '@/lib/auth/roles';
import { formatDateTime } from '@/lib/format';

export function UsersTable({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Users</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <Link
                href={`/users/${user.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {user.firstName} {user.lastName}
              </Link>
              {user.id === currentUserId ? (
                <span className="text-muted-foreground ml-2 text-sm">
                  (you)
                </span>
              ) : null}
            </TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{formatRole(user.role)}</TableCell>
            <TableCell>{formatDateTime(user.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
