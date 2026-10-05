import { SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the given roles. Method overrides class. */
export const Roles = (...roles: [Role, ...Role[]]) =>
  SetMetadata(ROLES_KEY, roles);
