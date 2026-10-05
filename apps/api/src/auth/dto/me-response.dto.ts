import type { Role } from '../../generated/prisma/client.js';

export class MeResponseDto {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
