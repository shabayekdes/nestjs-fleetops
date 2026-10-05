import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { verify } from '@node-rs/argon2';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UsersService } from './users.service.js';

type Fn = (args?: unknown) => Promise<unknown>;
type Args = {
  where?: unknown;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: unknown;
  skip?: number;
  take?: number;
};

const ORG = 'org-1';
const ME = 'me-id';
const OTHER = 'other-id';

const admin: AuthUser = { userId: ME, organizationId: ORG, role: 'ADMIN' };

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
  });

const rejection = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
};

describe('UsersService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findFirst = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const del = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: UsersService;

  const query = (o: Partial<ListUsersQueryDto> = {}): ListUsersQueryDto => ({
    page: 1,
    limit: 20,
    ...o,
  });

  const createDto = (o: Partial<CreateUserDto> = {}): CreateUserDto => ({
    firstName: 'Jamie',
    lastName: 'Rivera',
    email: 'jamie@acme.test',
    password: 'a-long-enough-password',
    role: 'DRIVER',
    ...o,
  });

  const allMocks = [findMany, count, findFirst, create, update, del];

  beforeEach(async () => {
    for (const m of allMocks) m.mockReset();
    $transaction.mockReset();
    $transaction.mockImplementation((ops) => Promise.all(ops));
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findMany, count, findFirst, create, update, delete: del },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  const noDbCalls = () => {
    for (const m of allMocks) expect(m).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  };

  describe('findAll', () => {
    it('scopes by organization with skip/take and stable ordering', async () => {
      findMany.mockResolvedValue([{ id: 'u1' }]);
      count.mockResolvedValue(41);

      const result = await service.findAll(ORG, query({ page: 3, limit: 10 }));

      expect(result).toEqual({
        data: [{ id: 'u1' }],
        meta: { page: 3, limit: 10, total: 41 },
      });
      const args = findMany.mock.calls[0][0] as Args;
      expect(args.where).toEqual({ organizationId: ORG });
      expect(args.skip).toBe(20);
      expect(args.take).toBe(10);
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(count).toHaveBeenCalledWith({ where: { organizationId: ORG } });
    });

    it('adds the role filter to both findMany and count', async () => {
      await service.findAll(ORG, query({ role: 'MANAGER' }));

      const where = { organizationId: ORG, role: 'MANAGER' };
      expect((findMany.mock.calls[0][0] as Args).where).toEqual(where);
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('selects exactly the 7 public fields', async () => {
      await service.findAll(ORG, query());
      const select = (findMany.mock.calls[0][0] as Args).select ?? {};
      expect(Object.keys(select).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'id',
          'lastName',
          'role',
          'updatedAt',
        ].sort(),
      );
    });

    it('returns an empty page', async () => {
      await expect(service.findAll(ORG, query())).resolves.toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('queries by id and organizationId', async () => {
      findFirst.mockResolvedValue({ id: OTHER });
      await expect(service.findOne(ORG, OTHER)).resolves.toEqual({
        id: OTHER,
      });
      expect((findFirst.mock.calls[0][0] as Args).where).toEqual({
        id: OTHER,
        organizationId: ORG,
      });
    });

    it('throws 404 "User not found" when missing', async () => {
      findFirst.mockResolvedValue(null);
      const error = await rejection(service.findOne(ORG, OTHER));
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('User not found');
    });
  });

  describe('create', () => {
    it('stores a verifiable argon2 hash and only the expected keys', async () => {
      create.mockResolvedValue({ id: 'new' });

      await service.create(ORG, createDto());

      const args = create.mock.calls[0][0] as Args;
      const data = args.data ?? {};
      expect(Object.keys(data).sort()).toEqual(
        [
          'email',
          'firstName',
          'lastName',
          'organizationId',
          'passwordHash',
          'role',
        ].sort(),
      );
      expect(data.organizationId).toBe(ORG);
      expect(data.role).toBe('DRIVER');
      expect(data.passwordHash).not.toBe('a-long-enough-password');
      await expect(
        verify(data.passwordHash as string, 'a-long-enough-password'),
      ).resolves.toBe(true);
      await expect(
        verify(data.passwordHash as string, 'wrong-password-123'),
      ).resolves.toBe(false);
    });

    it('does not spread unexpected DTO properties into data', async () => {
      create.mockResolvedValue({ id: 'new' });
      const dto = {
        ...createDto(),
        organizationId: 'evil-org',
        id: 'evil',
      } as CreateUserDto;

      await service.create(ORG, dto);

      const data = (create.mock.calls[0][0] as Args).data ?? {};
      expect(data.organizationId).toBe(ORG);
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('password');
    });

    it('selects without passwordHash and organizationId', async () => {
      create.mockResolvedValue({ id: 'new' });
      await service.create(ORG, createDto());
      const select = (create.mock.calls[0][0] as Args).select ?? {};
      expect(select).not.toHaveProperty('passwordHash');
      expect(select).not.toHaveProperty('organizationId');
      expect(Object.keys(select)).toHaveLength(7);
    });

    it('maps P2002 to 409', async () => {
      create.mockRejectedValue(prismaError('P2002'));
      const error = await rejection(service.create(ORG, createDto()));
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'A user with this email already exists',
      );
    });

    it('rethrows unknown errors unchanged', async () => {
      const failure = new Error('boom');
      create.mockRejectedValue(failure);
      expect(await rejection(service.create(ORG, createDto()))).toBe(failure);
    });

    it('rethrows other Prisma codes unchanged', async () => {
      const failure = prismaError('P2003');
      create.mockRejectedValue(failure);
      expect(await rejection(service.create(ORG, createDto()))).toBe(failure);
    });
  });

  describe('update', () => {
    it('scopes the update by id and organizationId and passes only given fields', async () => {
      update.mockResolvedValue({ id: OTHER });

      await service.update(admin, OTHER, { firstName: 'New' });

      const args = update.mock.calls[0][0] as Args;
      expect(args.where).toEqual({ id: OTHER, organizationId: ORG });
      expect(args.data).toMatchObject({ firstName: 'New' });
      const defined = Object.entries(args.data ?? {}).filter(
        ([, v]) => v !== undefined,
      );
      expect(defined).toEqual([['firstName', 'New']]);
      expect(args.select).not.toHaveProperty('passwordHash');
    });

    it('maps P2002 to 409', async () => {
      update.mockRejectedValue(prismaError('P2002'));
      const error = await rejection(
        service.update(admin, OTHER, { email: 'x@y.test' }),
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'A user with this email already exists',
      );
    });

    it('maps P2025 to 404', async () => {
      update.mockRejectedValue(prismaError('P2025'));
      const error = await rejection(
        service.update(admin, OTHER, { firstName: 'x' }),
      );
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('User not found');
    });

    it('rethrows unknown errors', async () => {
      const failure = new Error('boom');
      update.mockRejectedValue(failure);
      expect(
        await rejection(service.update(admin, OTHER, { firstName: 'x' })),
      ).toBe(failure);
    });

    it('rejects changing own role with 409 before any DB call', async () => {
      const error = await rejection(
        service.update(admin, ME, { role: 'MANAGER' }),
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'You cannot change your own role',
      );
      noDbCalls();
    });

    it('allows a self PATCH with the same role', async () => {
      update.mockResolvedValue({ id: ME });
      await expect(
        service.update(admin, ME, { role: 'ADMIN' }),
      ).resolves.toEqual({ id: ME });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('allows changing own name and email', async () => {
      update.mockResolvedValue({ id: ME });
      await service.update(admin, ME, {
        firstName: 'Me',
        email: 'me@acme.test',
      });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('allows changing another user role', async () => {
      update.mockResolvedValue({ id: OTHER });
      await service.update(admin, OTHER, { role: 'DRIVER' });
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('deletes scoped by id and organizationId', async () => {
      del.mockResolvedValue({ id: OTHER });
      await expect(service.remove(admin, OTHER)).resolves.toBeUndefined();
      expect((del.mock.calls[0][0] as Args).where).toEqual({
        id: OTHER,
        organizationId: ORG,
      });
    });

    it('rejects deleting self with 409 before any DB call', async () => {
      const error = await rejection(service.remove(admin, ME));
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'You cannot delete your own account',
      );
      noDbCalls();
    });

    it('maps P2025 to 404', async () => {
      del.mockRejectedValue(prismaError('P2025'));
      const error = await rejection(service.remove(admin, OTHER));
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('User not found');
    });

    it('rethrows unknown errors', async () => {
      const failure = new Error('boom');
      del.mockRejectedValue(failure);
      expect(await rejection(service.remove(admin, OTHER))).toBe(failure);
    });
  });
});
