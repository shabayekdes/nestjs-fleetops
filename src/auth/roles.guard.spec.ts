import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class PlainController {
  handler(): void {}
}

class HandlerAdminController {
  @Roles(Role.ADMIN)
  handler(): void {}
}

@Roles(Role.ADMIN)
class ClassAdminController {
  handler(): void {}
}

@Roles(Role.ADMIN)
class OverrideController {
  @Roles(Role.ADMIN, Role.MANAGER)
  handler(): void {}
}

type Target = new () => { handler(): void };

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  const makeContext = (controller: Target, role?: Role): ExecutionContext => {
    const request = {
      user:
        role === undefined
          ? undefined
          : { userId: 'u', organizationId: 'o', role },
    } as unknown as AuthenticatedRequest;
    return {
      getHandler: () =>
        (controller.prototype as { handler: () => void }).handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  it('allows any role when there is no @Roles metadata', () => {
    expect(guard.canActivate(makeContext(PlainController, Role.DRIVER))).toBe(
      true,
    );
  });

  it('allows a request without a user when there is no metadata', () => {
    expect(guard.canActivate(makeContext(PlainController))).toBe(true);
  });

  it('allows a listed role on the handler', () => {
    expect(
      guard.canActivate(makeContext(HandlerAdminController, Role.ADMIN)),
    ).toBe(true);
  });

  it('allows a listed role on the class', () => {
    expect(
      guard.canActivate(makeContext(ClassAdminController, Role.ADMIN)),
    ).toBe(true);
  });

  it.each([Role.DRIVER, Role.MANAGER])(
    'rejects %s when only ADMIN is allowed with a bare 403',
    (role) => {
      let error: unknown;
      try {
        guard.canActivate(makeContext(HandlerAdminController, role));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe('Forbidden');
      expect((error as ForbiddenException).getStatus()).toBe(403);
    },
  );

  it('rejects a non-admin on a class-level @Roles', () => {
    expect(() =>
      guard.canActivate(makeContext(ClassAdminController, Role.MANAGER)),
    ).toThrow(ForbiddenException);
  });

  it('lets handler metadata override class metadata (MANAGER allowed)', () => {
    expect(
      guard.canActivate(makeContext(OverrideController, Role.MANAGER)),
    ).toBe(true);
  });

  it('still rejects DRIVER when handler metadata overrides class metadata', () => {
    expect(() =>
      guard.canActivate(makeContext(OverrideController, Role.DRIVER)),
    ).toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when metadata exists but no user is set', () => {
    expect(() =>
      guard.canActivate(makeContext(HandlerAdminController)),
    ).toThrow(UnauthorizedException);
  });
});
