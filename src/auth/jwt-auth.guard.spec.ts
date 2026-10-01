import { jest } from '@jest/globals';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
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
    guard = new JwtAuthGuard(new Reflector(), {
      verifyAsync,
    } as unknown as JwtService);
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
        verifyAsync.mockResolvedValue({ sub: 'u', org: 'o' });
        const { context } = makeContext(PlainController, header);
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verifyAsync).toHaveBeenCalledWith('tok', expect.anything());
      },
    );

    it('pins the algorithm to HS256 when verifying', async () => {
      verifyAsync.mockResolvedValue({ sub: 'u', org: 'o' });
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
      ['missing org', { sub: 'u' }],
      ['missing sub', { org: 'o' }],
      ['empty sub', { sub: '', org: 'o' }],
      ['empty org', { sub: 'u', org: '' }],
      ['numeric sub', { sub: 1, org: 'o' }],
      ['null org', { sub: 'u', org: null }],
      ['array sub', { sub: ['u'], org: 'o' }],
    ])('rejects invalid payload (%s)', async (_name, payload) => {
      verifyAsync.mockResolvedValue(payload);
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });

    it('attaches exactly { userId, organizationId } for a valid payload', async () => {
      verifyAsync.mockResolvedValue({
        sub: 'user-1',
        org: 'org-1',
        iat: 1,
        exp: 2,
        extra: 'x',
      });
      const { context, request } = makeContext(PlainController, 'Bearer tok');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        userId: 'user-1',
        organizationId: 'org-1',
      });
    });
  });
});
