import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/public.decorator.js';

@ApiTags('root')
@Controller()
export class AppController {
  @Public()
  @Get()
  getRoot(): { message: string } {
    return { message: 'FleetOps API is running' };
  }
}
