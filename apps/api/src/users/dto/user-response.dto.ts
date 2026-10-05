import type { Role } from '../../generated/prisma/client.js';

export class UserResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export class UserListResponseDto {
  data: UserResponseDto[];
  meta: { page: number; limit: number; total: number };
}
