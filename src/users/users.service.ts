import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type {
  UserListResponseDto,
  UserResponseDto,
} from './dto/user-response.dto.js';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Maps known Prisma errors to HTTP exceptions; anything else is returned unchanged. */
function toHttpError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
  if (error.code === 'P2025') return new NotFoundException('User not found');
  if (error.code === 'P2002') {
    return new ConflictException('A user with this email already exists');
  }
  return error;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: ListUsersQueryDto,
  ): Promise<UserListResponseDto> {
    const { page, limit, role } = query;
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(role !== undefined && { role }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async findOne(organizationId: string, id: string): Promise<UserResponseDto> {
    const found = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: USER_SELECT,
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  async create(
    organizationId: string,
    dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const passwordHash = await hash(dto.password);
    try {
      return await this.prisma.user.create({
        data: {
          organizationId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    if (
      id === user.userId &&
      dto.role !== undefined &&
      dto.role !== user.role
    ) {
      throw new ConflictException('You cannot change your own role');
    }
    try {
      // undefined = unchanged.
      return await this.prisma.user.update({
        where: { id, organizationId: user.organizationId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          role: dto.role,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    if (id === user.userId) {
      throw new ConflictException('You cannot delete your own account');
    }
    try {
      await this.prisma.user.delete({
        where: { id, organizationId: user.organizationId },
        select: { id: true },
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
