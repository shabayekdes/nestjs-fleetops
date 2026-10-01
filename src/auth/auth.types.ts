import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  organizationId: string;
}

export interface JwtPayload {
  sub: string;
  org: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };
