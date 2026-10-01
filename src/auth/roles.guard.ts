import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Defensive: JwtAuthGuard runs first and always sets the user.
    if (!request.user) {
      throw new UnauthorizedException();
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
