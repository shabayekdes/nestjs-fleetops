import { randomBytes } from 'node:crypto';
import {
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser, JwtPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import type { MeResponseDto } from './dto/me-response.dto.js';

const PROFILE_SELECT = {
  id: true,
  organizationId: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly expiresIn: number;
  /** Verified against when the user is unknown, to equalize response timing. */
  private dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.expiresIn = config.get('JWT_EXPIRES_IN', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(32).toString('base64url'));
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        organization: { slug: dto.organizationSlug },
      },
      select: { id: true, organizationId: true, passwordHash: true },
    });

    const valid = await this.verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      dto.password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, org: user.organizationId };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, tokenType: 'Bearer', expiresIn: this.expiresIn };
  }

  async getProfile(user: AuthUser): Promise<MeResponseDto> {
    const profile = await this.prisma.user.findFirst({
      where: { id: user.userId, organizationId: user.organizationId },
      select: PROFILE_SELECT,
    });
    if (!profile) {
      throw new UnauthorizedException();
    }
    return profile;
  }

  private async verifyPassword(
    hashed: string,
    password: string,
  ): Promise<boolean> {
    try {
      return await verify(hashed, password);
    } catch {
      return false;
    }
  }
}
