import { jest } from '@jest/globals';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';

describe('AuthService', () => {
  const PASSWORD = 'Correct-Horse-Battery-1!';
  let passwordHash: string;

  const findFirst = jest.fn<(args: unknown) => Promise<unknown>>();
  const update = jest.fn<(args: unknown) => Promise<unknown>>();
  const signAsync = jest.fn<(payload: unknown) => Promise<string>>();
  let service: AuthService;

  const dto = (overrides: Partial<LoginDto> = {}): LoginDto => ({
    organizationSlug: 'acme',
    email: 'alex@acme.test',
    password: PASSWORD,
    ...overrides,
  });

  const storedUser = (hashValue?: string) => ({
    id: 'user-1',
    organizationId: 'org-1',
    passwordHash: hashValue ?? passwordHash,
  });

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
  });

  beforeEach(async () => {
    findFirst.mockReset();
    update.mockReset();
    signAsync.mockReset();
    signAsync.mockResolvedValue('signed.jwt.token');

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { findFirst, update } } },
        { provide: JwtService, useValue: { signAsync } },
        { provide: ConfigService, useValue: { get: () => 900 } },
      ],
    }).compile();
    await moduleRef.init();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a bearer token response on valid credentials', async () => {
      findFirst.mockResolvedValue(storedUser());

      await expect(service.login(dto())).resolves.toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    });

    it('looks the user up by email within the organization slug', async () => {
      findFirst.mockResolvedValue(storedUser());

      await service.login(dto());

      expect(findFirst).toHaveBeenCalledTimes(1);
      const args = findFirst.mock.calls[0][0] as {
        where: unknown;
        select: Record<string, unknown>;
      };
      expect(args.where).toEqual({
        email: 'alex@acme.test',
        organization: { slug: 'acme' },
      });
      expect(args.select).toMatchObject({ passwordHash: true });
    });

    it('signs exactly { sub, org }', async () => {
      findFirst.mockResolvedValue(storedUser());

      await service.login(dto());

      expect(signAsync).toHaveBeenCalledTimes(1);
      expect(signAsync).toHaveBeenCalledWith({ sub: 'user-1', org: 'org-1' });
    });

    it('rejects an unknown user without signing', async () => {
      findFirst.mockResolvedValue(null);

      const error = await service.login(dto()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid credentials',
      );
      expect(signAsync).not.toHaveBeenCalled();
    });

    it('rejects a wrong password without signing', async () => {
      findFirst.mockResolvedValue(storedUser());

      await expect(
        service.login(dto({ password: 'wrong-password' })),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(signAsync).not.toHaveBeenCalled();
    });

    it('rejects a password that differs only in case', async () => {
      findFirst.mockResolvedValue(storedUser());

      await expect(
        service.login(dto({ password: PASSWORD.toUpperCase() })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(signAsync).not.toHaveBeenCalled();
    });

    it('treats a malformed stored hash as 401, not 500', async () => {
      findFirst.mockResolvedValue(storedUser('not-a-real-hash'));

      const error = await service.login(dto()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid credentials',
      );
      expect(signAsync).not.toHaveBeenCalled();
    });

    it('gives identical responses for unknown user and wrong password', async () => {
      findFirst.mockResolvedValueOnce(null);
      const unknownUser = (await service
        .login(dto())
        .catch((e: unknown) => e)) as UnauthorizedException;

      findFirst.mockResolvedValueOnce(storedUser());
      const wrongPassword = (await service
        .login(dto({ password: 'nope' }))
        .catch((e: unknown) => e)) as UnauthorizedException;

      expect(unknownUser.getResponse()).toEqual(wrongPassword.getResponse());
      expect(unknownUser.getStatus()).toBe(wrongPassword.getStatus());
    });

    it('propagates database errors instead of returning 401', async () => {
      const failure = new Error('connection refused');
      findFirst.mockRejectedValue(failure);

      const error = await service.login(dto()).catch((e: unknown) => e);

      expect(error).toBe(failure);
      expect(error).not.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    const profile = {
      id: 'user-1',
      organizationId: 'org-1',
      organization: { id: 'org-1', name: 'Acme', slug: 'acme' },
      firstName: 'Alex',
      lastName: 'Doe',
      email: 'alex@acme.test',
      role: 'ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('queries by id and organizationId and returns the row', async () => {
      findFirst.mockResolvedValue(profile);

      const result = await service.getProfile({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ADMIN',
      });

      expect(result).toBe(profile);
      const args = findFirst.mock.calls[0][0] as {
        where: unknown;
        select: Record<string, unknown>;
      };
      expect(args.where).toEqual({ id: 'user-1', organizationId: 'org-1' });
      expect(args.select).not.toHaveProperty('passwordHash');
      expect(args.select.organization).toEqual({
        select: { id: true, name: true, slug: true },
      });
      expect(Object.keys(args.select).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'id',
          'lastName',
          'organization',
          'organizationId',
          'role',
          'updatedAt',
        ].sort(),
      );
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.getProfile({
          userId: 'gone',
          organizationId: 'org-1',
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
  describe('changePassword', () => {
    const NEW_PASSWORD = 'Brand-New-Password-2!';
    const authUser = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'DRIVER' as const,
    };
    const body = (o: Record<string, string> = {}) => ({
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      ...o,
    });

    it('updates the hash scoped by id and organizationId', async () => {
      findFirst.mockResolvedValue({ passwordHash });
      update.mockResolvedValue({ id: 'user-1' });

      await expect(
        service.changePassword(authUser, body()),
      ).resolves.toBeUndefined();

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1', organizationId: 'org-1' },
        }),
      );
      const args = update.mock.calls[0][0] as {
        where: unknown;
        data: { passwordHash: string };
      };
      expect(args.where).toEqual({ id: 'user-1', organizationId: 'org-1' });
      expect(Object.keys(args.data)).toEqual(['passwordHash']);
      expect(args.data.passwordHash).not.toBe(NEW_PASSWORD);
      expect(args.data.passwordHash).not.toBe(passwordHash);
      await expect(verify(args.data.passwordHash, NEW_PASSWORD)).resolves.toBe(
        true,
      );
      await expect(verify(args.data.passwordHash, PASSWORD)).resolves.toBe(
        false,
      );
    });

    it('rejects a wrong current password with 400 and no update', async () => {
      findFirst.mockResolvedValue({ passwordHash });

      const error = await service
        .changePassword(authUser, body({ currentPassword: 'wrong-password-1' }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Current password is incorrect',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects newPassword equal to currentPassword before any lookup', async () => {
      const error = await service
        .changePassword(
          authUser,
          body({ currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'newPassword must differ from currentPassword',
      );
      expect(findFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('throws 401 when the user no longer exists', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(authUser, body()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
    });

    it('treats a malformed stored hash as a wrong password (400, not 500)', async () => {
      findFirst.mockResolvedValue({ passwordHash: 'not-a-real-hash' });

      await expect(
        service.changePassword(authUser, body()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('propagates database errors from the update', async () => {
      findFirst.mockResolvedValue({ passwordHash });
      const failure = new Error('db down');
      update.mockRejectedValue(failure);

      await expect(service.changePassword(authUser, body())).rejects.toBe(
        failure,
      );
    });
  });
});
