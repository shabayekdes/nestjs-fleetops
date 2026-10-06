import type { CurrentUser, Role } from '@/lib/api/types';

/** The only user data that crosses into Client Components. No token, no ids. */
export type ShellUser = {
  name: string;
  email: string;
  role: Role;
  organizationName: string;
};

export function toShellUser(user: CurrentUser): ShellUser {
  return {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    role: user.role,
    organizationName: user.organization.name,
  };
}
