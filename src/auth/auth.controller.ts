import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import type { MeResponseDto } from './dto/me-response.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.authService.getProfile(user);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user, dto);
  }
}
