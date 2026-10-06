import type { Role } from '../../generated/prisma/client.js';

export class MeOrganizationDto {
  /** Organization id (UUID). */
  id: string;
  /** Organization display name. */
  name: string;
  /** Organization slug, used at login. */
  slug: string;
}

export class MeResponseDto {
  id: string;
  /** Equals `organization.id`; kept for compatibility. */
  organizationId: string;
  /** The caller's organization. */
  organization: MeOrganizationDto;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
