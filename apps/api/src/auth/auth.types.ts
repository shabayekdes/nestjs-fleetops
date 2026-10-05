import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

export interface AuthUser {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  org: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };
