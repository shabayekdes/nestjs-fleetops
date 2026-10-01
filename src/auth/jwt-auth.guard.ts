import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest, JwtPayload } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: Partial<Record<keyof JwtPayload, unknown>>;
    try {
      payload = await this.jwtService.verifyAsync<
        Partial<Record<keyof JwtPayload, unknown>>
      >(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException();
    }

    const { sub, org } = payload;
    if (typeof sub !== 'string' || sub === '') {
      throw new UnauthorizedException();
    }
    if (typeof org !== 'string' || org === '') {
      throw new UnauthorizedException();
    }

    request.user = { userId: sub, organizationId: org };
    return true;
  }

  private extractToken(header: string | undefined): string | undefined {
    if (!header) {
      return undefined;
    }
    const parts = header.split(' ');
    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== 'bearer' ||
      parts[1] === ''
    ) {
      return undefined;
    }
    return parts[1];
  }
}
