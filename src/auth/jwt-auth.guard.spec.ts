import { jest } from '@jest/globals';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';

class PlainController {
  handler(): void {}
}

class HandlerPublicController {
  @Public()
  handler(): void {}
}

@Public()
class ClassPublicController {
  handler(): void {}
}

type Target = new () => { handler(): void };

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const USER_ID = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
  const ORG_ID = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
  let guard: JwtAuthGuard;

  const makeContext = (
    controller: Target,
    authorization?: string,
  ): { context: ExecutionContext; request: AuthenticatedRequest } => {
    const request = {
      headers: authorization === undefined ? {} : { authorization },
    } as AuthenticatedRequest;
    const context = {
      getHandler: () =>
        (controller.prototype as { handler: () => void }).handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    verifyAsync.mockReset();
    findFirst.mockReset();
    findFirst.mockResolvedValue({
      id: USER_ID,
      organizationId: ORG_ID,
      role: 'ADMIN',
    });
    guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync } as unknown as JwtService,
      { user: { findFirst } } as unknown as PrismaService,
    );
  });

  describe('public routes', () => {
    it('allows a public handler without verifying', async () => {
      const { context } = makeContext(HandlerPublicController);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('allows a public class without verifying', async () => {
      const { context } = makeContext(ClassPublicController);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('allows a public route even with a garbage header', async () => {
      const { context } = makeContext(
        HandlerPublicController,
        'Bearer garbage',
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('does not query the database on a public route', async () => {
      const { context } = makeContext(HandlerPublicController, 'Bearer tok');
      await guard.canActivate(context);
      expect(findFirst).not.toHaveBeenCalled();
    });
  });

  describe('protected routes', () => {
    it('rejects a request without an Authorization header', async () => {
      const { context } = makeContext(PlainController);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it.each([
      'Bearer',
      'Bearer ',
      'Basic abc',
      'Token abc',
      'Bearer a b',
      'abc',
      '',
      'Bearer  abc',
    ])('rejects malformed header %j without verifying', async (header) => {
      const { context } = makeContext(PlainController, header);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it.each(['Bearer tok', 'bearer tok', 'BEARER tok', 'BeArEr tok'])(
      'accepts scheme case-insensitively: %j',
      async (header) => {
        verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
        const { context } = makeContext(PlainController, header);
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verifyAsync).toHaveBeenCalledWith('tok', expect.anything());
      },
    );

    it('pins the algorithm to HS256 when verifying', async () => {
      verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
      const { context } = makeContext(PlainController, 'Bearer tok');
      await guard.canActivate(context);
      expect(verifyAsync).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ algorithms: ['HS256'] }),
      );
    });

    it.each([
      new Error('jwt expired'),
      new Error('invalid signature'),
      new TypeError('weird'),
      'string rejection',
    ])('maps verify failure %j to a bare 401', async (failure) => {
      verifyAsync.mockRejectedValue(failure);
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      const error = await guard.canActivate(context).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe('Unauthorized');
      expect(request.user).toBeUndefined();
    });

    it.each<[string, unknown]>([
      ['empty', {}],
      ['missing org', { sub: USER_ID }],
      ['missing sub', { org: ORG_ID }],
      ['empty sub', { sub: '', org: ORG_ID }],
      ['empty org', { sub: USER_ID, org: '' }],
      ['non-UUID sub', { sub: 'u', org: ORG_ID }],
      ['non-UUID org', { sub: USER_ID, org: 'o' }],
      ['numeric sub', { sub: 1, org: ORG_ID }],
      ['null org', { sub: USER_ID, org: null }],
      ['array sub', { sub: [USER_ID], org: ORG_ID }],
    ])('rejects invalid payload (%s)', async (_name, payload) => {
      verifyAsync.mockResolvedValue(payload);
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the user no longer exists', async () => {
      verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
      findFirst.mockResolvedValue(null);
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });

    it.each(['MANAGER', 'DRIVER'])(
      'reflects the role read from the database (%s)',
      async (role) => {
        verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
        findFirst.mockResolvedValue({
          id: USER_ID,
          organizationId: ORG_ID,
          role,
        });
        const { context, request } = makeContext(PlainController, 'Bearer tok');
        await guard.canActivate(context);
        expect(request.user.role).toBe(role);
      },
    );

    it('ignores a role claim in the token', async () => {
      verifyAsync.mockResolvedValue({
        sub: USER_ID,
        org: ORG_ID,
        role: 'ADMIN',
      });
      findFirst.mockResolvedValue({
        id: USER_ID,
        organizationId: ORG_ID,
        role: 'DRIVER',
      });
      const { context, request } = makeContext(PlainController, 'Bearer tok');
      await guard.canActivate(context);
      expect(request.user.role).toBe('DRIVER');
    });

    it('selects only id, organizationId and role', async () => {
      verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
      const { context } = makeContext(PlainController, 'Bearer tok');
      await guard.canActivate(context);
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: USER_ID, organizationId: ORG_ID },
        select: { id: true, organizationId: true, role: true },
      });
    });

    it('propagates database errors instead of returning 401', async () => {
      verifyAsync.mockResolvedValue({ sub: USER_ID, org: ORG_ID });
      const failure = new Error('db down');
      findFirst.mockRejectedValue(failure);
      const { context } = makeContext(PlainController, 'Bearer tok');
      await expect(guard.canActivate(context)).rejects.toBe(failure);
    });

    it('attaches exactly { userId, organizationId, role } for a valid payload', async () => {
      verifyAsync.mockResolvedValue({
        sub: USER_ID,
        org: ORG_ID,
        iat: 1,
        exp: 2,
        extra: 'x',
      });
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, organizationId: ORG_ID },
        }),
      );
      expect(request.user).toEqual({
        userId: USER_ID,
        organizationId: ORG_ID,
        role: 'ADMIN',
      });
    });
  });
});
